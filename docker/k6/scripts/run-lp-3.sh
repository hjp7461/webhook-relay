#!/usr/bin/env sh
# docker/k6/scripts/run-lp-3.sh — LP-3 stress sustained 측정 자동화
# (8 단계 프로토콜 + Redis 자원 지표 sampling)
#
# 단일 출처:
# - PRD docs/prd-phase4/01-load-profiles.md §3.1 LP-3
# - PRD docs/prd-phase4/03-targets-and-rebaseline.md §3.1 (8 단계 측정 프로토콜)
# - PRD docs/prd-phase4/04-scaling-and-knees.md §5.2 + §5.3 (knee point 탐색 절차)
# - PLAN docs/plan-phase4/05-m-load-4-lp3-lp4.md §3.1 + §4 단계 3
# - SLO PromQL 단일 출처: docker/prometheus/rules/*.yaml (3단계 잠금)
#
# 본 스크립트가 자동화하는 것:
#   [1] 부트스트랩 → [2] 메타데이터 → [3] warmup → [4] load + Redis stats
#   sampling → [5] cooldown → [5b] logs capture → [6] Prometheus query →
#   [8] cleanup
#
# 본 스크립트가 자동화하지 않는 것 (사람 수동):
#   - [7] 통계 추출 + LP-3_<date>.md 보고서 작성 (PLAN §4 단계 5)
#   - 결과 무효 조건 발동 시 재측정 결정 (PLAN §3.3 + PRD `03` §3.4)
#   - OOM / Redis 한계 도달 시 PLAN 중단 vs 측정 변수 기록 결정 (PLAN §2 자율 일탈
#     사전 승인 — 사용자 위임)
#
# 사용 예 (호스트 측 수동 실행, 저장소 루트):
#   ./docker/k6/scripts/run-lp-3.sh
#   W_LOAD_S=300 ./docker/k6/scripts/run-lp-3.sh      # 짧은 smoke
#
# 의존성: POSIX shell + docker + docker compose + curl + date + git.
#
# 안전망 (run-lp-1.sh / run-lp-2.sh 동일 패턴):
#   - set -eu + trap EXIT cleanup
#   - docker compose up --build (stale image 방지)
#   - fail-fast readiness gate (/healthz / /metrics / Prometheus targets up)
#   - [5b] api/worker container logs capture
#
# 본 스크립트 보강 (LP-3 특이):
#   - W_load 동안 background 로 docker stats + redis-cli INFO 30초 간격 sampling
#     → redis-stats.json (knee point bound 원인 분석 자료)

set -eu

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# ---------- cleanup trap ----------
cleanup() {
  rc=$?
  echo ""
  # background polling 잔류 방지 (set -e 중도 실패 대비)
  if [ -n "${REDIS_POLL_PID:-}" ]; then
    kill "${REDIS_POLL_PID}" 2>/dev/null || true
  fi
  echo "[cleanup] docker compose down -v (trap EXIT, exit code=${rc})"
  docker compose down -v 2>&1 | tail -5 || true
}
trap cleanup EXIT

# ---------- 환경 파라미터 ----------
# 측정 윈도우 (PRD `01` §5 + Q-LOAD-8 (b) sustained, LP-2 동일)
W_WARMUP_S="${W_WARMUP_S:-60}"
W_LOAD_S="${W_LOAD_S:-1800}"      # 30m
W_COOLDOWN_S="${W_COOLDOWN_S:-60}"

# 부하 파라미터 (PRD `01` §3.1 LP-3 + Q-LOAD-6 (b) 중도 셋)
RPS="${RPS:-500}"

# Redis stats sampling 간격
REDIS_SAMPLE_INTERVAL_S="${REDIS_SAMPLE_INTERVAL_S:-30}"

# 호스트 측 endpoint
API_URL="${API_URL:-http://localhost:3000}"
WORKER_URL="${WORKER_URL:-http://localhost:3001}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

echo "=== LP-3 stress sustained measurement ==="
echo "Window: warmup=${W_WARMUP_S}s + load=${W_LOAD_S}s + cooldown=${W_COOLDOWN_S}s"
echo "Rate: ${RPS} RPS  (P=large 64KB 고정)"
echo "Redis sampling interval: ${REDIS_SAMPLE_INTERVAL_S}s"

# ---------- helpers ----------
wait_for_curl_ok() {
  url="$1"
  label="$2"
  max_attempts="${3:-30}"
  attempt=1
  while [ "${attempt}" -le "${max_attempts}" ]; do
    if curl -sf "${url}" > /dev/null 2>&1; then
      echo "    ${label} ready (attempt ${attempt})"
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  echo "    ${label} NOT ready after ${max_attempts} attempts" >&2
  return 1
}

prom_query_range() {
  q="$1"
  label="$2"
  start="$3"
  end="$4"
  result="$(curl -sf -G "${PROMETHEUS_URL}/api/v1/query_range" \
    --data-urlencode "query=${q}" \
    --data-urlencode "start=${start}" \
    --data-urlencode "end=${end}" \
    --data-urlencode "step=15s" || echo '{"status":"error","data":null}')"
  printf '{"label":"%s","result":%s}\n' "${label}" "${result}"
}

prom_query_instant() {
  q="$1"
  label="$2"
  at="$3"
  result="$(curl -sf -G "${PROMETHEUS_URL}/api/v1/query" \
    --data-urlencode "query=${q}" \
    --data-urlencode "time=${at}" || echo '{"status":"error","data":null}')"
  printf '{"label":"%s","result":%s}\n' "${label}" "${result}"
}

# Redis stats sampling — background 로 30초 간격 capture.
# 본 함수가 호출되면 무한 루프 (cleanup trap 이 kill).
# 출력: 1 sample = 1 JSON line (jsonl 형식, 파싱 용이).
redis_stats_poller() {
  out="$1"
  interval="$2"
  while true; do
    ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    # docker stats — 컨테이너 측 인식
    docker_line="$(docker stats --no-stream --format '{"cpu":"{{.CPUPerc}}","mem_perc":"{{.MemPerc}}","mem_usage":"{{.MemUsage}}","net_io":"{{.NetIO}}","block_io":"{{.BlockIO}}","pids":"{{.PIDs}}"}' webhook-relay-redis 2>/dev/null || echo '{"error":"docker stats failed"}')"
    # redis-cli INFO — Redis 자체 인식
    redis_info="$(docker exec webhook-relay-redis redis-cli INFO 2>/dev/null \
      | grep -E '^(used_cpu_sys|used_cpu_user|used_memory_human|used_memory_rss_human|connected_clients|total_commands_processed|instantaneous_ops_per_sec|rejected_connections):' \
      | tr '\r' '\n' \
      | awk -F: 'NF==2 {gsub(/[\r\n"]/,""); printf "\"%s\":\"%s\",", $1, $2}' \
      | sed 's/,$//' || true)"
    printf '{"ts":"%s","docker":%s,"redis":{%s}}\n' "${ts}" "${docker_line}" "${redis_info}" >> "${out}"
    sleep "${interval}"
  done
}

MEASUREMENT_ID="LP-3_$(date -u +%Y-%m-%dT%H-%M-%SZ)"
RESULTS_DIR="docker/k6/results/${MEASUREMENT_ID}"
mkdir -p "${RESULTS_DIR}"

# ---------- [1] 부트스트랩 ----------
echo ""
echo "[1] Bootstrap — docker compose up -d --build (5 services, k6 excluded)"
docker compose up -d --build redis api worker prometheus grafana

echo "    Waiting for /healthz 200 (api) ..."
wait_for_curl_ok "${API_URL}/healthz" "api" 30 || exit 1

echo "    Waiting for /metrics 200 (worker) ..."
wait_for_curl_ok "${WORKER_URL}/metrics" "worker" 30 || exit 1

echo "    Waiting for Prometheus targets up>=2 ..."
prom_ready=0
for i in $(seq 1 30); do
  TARGETS_UP="$(curl -sf "${PROMETHEUS_URL}/api/v1/targets?state=active" 2>/dev/null \
    | grep -o '"health":"up"' | wc -l | tr -d ' ')"
  if [ "${TARGETS_UP:-0}" -ge 2 ]; then
    echo "    Prometheus targets up=${TARGETS_UP} (attempt $i)"
    prom_ready=1
    break
  fi
  sleep 2
done
if [ "${prom_ready}" -ne 1 ]; then
  echo "    Prometheus targets NOT up after 30 attempts (60s)" >&2
  exit 1
fi

# ---------- [2] 메타데이터 수집 ----------
echo ""
echo "[2] Collect measurement host metadata"
./docker/k6/scripts/collect-metadata.sh > "${RESULTS_DIR}/metadata.yaml"
printf 'lp_id: LP-3\n' >> "${RESULTS_DIR}/metadata.yaml"
printf 'rps: %s\n' "${RPS}" >> "${RESULTS_DIR}/metadata.yaml"
echo "    -> ${RESULTS_DIR}/metadata.yaml"

# ---------- [3] 워밍업 ----------
echo ""
echo "[3] Warmup (${W_WARMUP_S}s, RPS=${RPS})"
T_WARMUP_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose --profile measure run --rm \
  -e STAGE=warmup \
  -e DURATION="${W_WARMUP_S}s" \
  -e RPS="${RPS}" \
  k6 run --summary-export="/results/${MEASUREMENT_ID}/k6-warmup.json" \
    /scenarios/lp-3.js
T_WARMUP_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "    warmup: ${T_WARMUP_START} → ${T_WARMUP_END}"

# ---------- [4] 부하 인가 + Redis stats sampling ----------
echo ""
echo "[4] Load (${W_LOAD_S}s, RPS=${RPS}, P=large 64KB 고정)"
T_LOAD_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Redis stats background polling 시작
REDIS_STATS_OUT="${RESULTS_DIR}/redis-stats.jsonl"
echo "" > "${REDIS_STATS_OUT}"
redis_stats_poller "${REDIS_STATS_OUT}" "${REDIS_SAMPLE_INTERVAL_S}" &
REDIS_POLL_PID=$!
echo "    Redis stats poller started (PID=${REDIS_POLL_PID}, interval=${REDIS_SAMPLE_INTERVAL_S}s)"

docker compose --profile measure run --rm \
  -e STAGE=load \
  -e DURATION="${W_LOAD_S}s" \
  -e RPS="${RPS}" \
  k6 run --summary-export="/results/${MEASUREMENT_ID}/k6-load.json" \
    /scenarios/lp-3.js
T_LOAD_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "    load: ${T_LOAD_START} → ${T_LOAD_END}"

# Redis polling 종료
kill "${REDIS_POLL_PID}" 2>/dev/null || true
wait "${REDIS_POLL_PID}" 2>/dev/null || true
REDIS_POLL_PID=""
echo "    Redis stats poller stopped (-> ${REDIS_STATS_OUT}, $(wc -l < "${REDIS_STATS_OUT}") samples)"

printf '%s\n' "${T_LOAD_START}" > "${RESULTS_DIR}/t_start"
printf '%s\n' "${T_LOAD_END}"   > "${RESULTS_DIR}/t_end"

# ---------- [5] 쿨다운 ----------
echo ""
echo "[5] Cooldown (${W_COOLDOWN_S}s)"
sleep "${W_COOLDOWN_S}"

# ---------- [5b] docker compose logs capture ----------
echo ""
echo "[5b] Capture container logs (api + worker)"
docker compose logs api > "${RESULTS_DIR}/api.log" 2>&1 || true
docker compose logs worker > "${RESULTS_DIR}/worker.log" 2>&1 || true
echo "    -> ${RESULTS_DIR}/api.log ($(wc -l < "${RESULTS_DIR}/api.log") lines)"
echo "    -> ${RESULTS_DIR}/worker.log ($(wc -l < "${RESULTS_DIR}/worker.log") lines)"

# ---------- [6] Prometheus query ----------
# SLO PromQL 단일 출처: docker/prometheus/rules/*.yaml (3단계 잠금).
# 본 스크립트는 4단계 measurement 측 컨슈머로서 라벨/집계 그대로.
echo ""
echo "[6] Prometheus queries (SLO + throughput + cardinality + knee point bound 후보)"
PROM_OUT="${RESULTS_DIR}/prom-queries.json"

{
  echo "["
  # ----- 공통 SLO 쿼리 (LP-1/LP-2 동일) -----
  prom_query_range \
    'sum(rate(webhook_relay_api_requests_total{route="/webhooks",status_class="5xx"}[5m])) / sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[5m]))' \
    'SLO-1_5xx_ratio' \
    "${T_LOAD_START}" "${T_LOAD_END}"
  echo ","
  prom_query_range \
    'histogram_quantile(0.99, sum by (le) (rate(webhook_relay_api_request_duration_seconds_bucket{route="/webhooks"}[5m])))' \
    'SLO-2_register_latency_p99' \
    "${T_LOAD_START}" "${T_LOAD_END}"
  echo ","
  prom_query_range \
    'histogram_quantile(0.99, sum by (le) (rate(webhook_relay_worker_processing_duration_seconds_bucket{outcome="success"}[5m])))' \
    'SLO-3_delivery_latency_p99' \
    "${T_LOAD_START}" "${T_LOAD_END}"
  echo ","
  prom_query_instant \
    'sum(rate(webhook_relay_dlq_jobs_total[1h])) / clamp_min(sum(rate(webhook_relay_jobs_processed_total[1h])), 1)' \
    'SLO-4_dlq_ratio' \
    "${T_LOAD_END}"
  echo ","
  prom_query_range \
    'sum(rate(webhook_relay_jobs_processed_total[5m]))' \
    'throughput_rps' \
    "${T_LOAD_START}" "${T_LOAD_END}"
  echo ","
  prom_query_instant \
    'count({__name__=~"webhook_relay_.*"})' \
    'cardinality' \
    "${T_LOAD_END}"

  # ----- LP-3 보강: 큐 길이 + 처리량 + Redis-bound 후보 -----
  # C1 queue_depth — knee point 식별의 핵심 (워커 포화 신호)
  echo ","
  prom_query_range \
    'sum by (job_state) (webhook_relay_queue_depth)' \
    'C1_queue_depth_by_state' \
    "${T_LOAD_START}" "${T_LOAD_END}"
  # 등록 RPS 도달률 (PLAN §3.3 결과 무효 조건 5 — LP-3 ±2% = [490, 510])
  echo ","
  prom_query_range \
    'sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[5m]))' \
    'register_rps_achieved' \
    "${T_LOAD_START}" "${T_LOAD_END}"
  # D3 페이로드 분포 검증 (64KB 고정 검증 — p50 ≈ p99 ≈ 64KB)
  echo ","
  prom_query_range \
    'histogram_quantile(0.5, sum by (le) (rate(webhook_relay_api_request_body_bytes_bucket{route="/webhooks"}[5m])))' \
    'D3_payload_p50' \
    "${T_LOAD_START}" "${T_LOAD_END}"
  echo ","
  prom_query_range \
    'histogram_quantile(0.99, sum by (le) (rate(webhook_relay_api_request_body_bytes_bucket{route="/webhooks"}[5m])))' \
    'D3_payload_p99' \
    "${T_LOAD_START}" "${T_LOAD_END}"
  echo "]"
} > "${PROM_OUT}"

echo "    -> ${PROM_OUT}"

# ---------- [8] cleanup (trap EXIT 가 마저 처리) ----------
echo ""
echo "=== LP-3 measurement complete ==="
echo "Results: ${RESULTS_DIR}/"
echo ""
echo "Next steps (manual — PLAN §4 단계 4 + 단계 5):"
echo "  1. Verify result validity (PLAN §3.3):"
echo "     - Metadata 메타데이터 8 항목 + lp_id + rps"
echo "     - RPS achieved ∈ [490, 510] (LP-3 ±2%)"
echo "     - Redis OOM / panic 없음 (api.log + worker.log + redis-stats.jsonl 확인)"
echo "     - 측정 분산 ±5% 안 (knee point 영역은 본질적 큼 — 무효 vs 측정 변수 결정 사용자 위임)"
echo "     - 카디널리티 ≤ 1000 (IT-OBS-11)"
echo "  2. Identify knee point candidate (PRD 'prd-phase4/04' §5.3):"
echo "     - 선형성(N=1, R=500) = LP-3 처리량 / 500 → < 0.8 면 knee 진입"
echo "     - p99 처리 지연 (SLO-3) 이 LP-2 nominal 대비 어느 정도 증가했는가"
echo "     - 큐 길이 (C1 waiting) 가 정상 상태 0 근처가 아닌 어느 값에 머무는가"
echo "     - bound 원인 분류 (Redis CPU / 메모리 / 네트워크 / 워커 경합)"
echo "  3. Write report to docs/prd-phase4/results/LP-3_<date>.md (PLAN §4 단계 5)"
echo "  4. Commit + push"
