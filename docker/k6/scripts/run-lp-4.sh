#!/usr/bin/env sh
# docker/k6/scripts/run-lp-4.sh — LP-4 spike (base 100 → spike 1000 → base 100) 측정 자동화
# (8 단계 프로토콜 + 큐 길이 1초 polling)
#
# 단일 출처:
# - PRD docs/prd-phase4/01-load-profiles.md §3.1 LP-4
# - PRD docs/prd-phase4/03-targets-and-rebaseline.md §3.1 (8 단계 측정 프로토콜)
# - PRD docs/prd-phase4/04-scaling-and-knees.md §4.3 (회복 시간 측정 의도)
# - PLAN docs/plan-phase4/05-m-load-4-lp3-lp4.md §3.2 + §4 단계 3
# - SLO PromQL 단일 출처: docker/prometheus/rules/*.yaml (3단계 잠금)
#
# 본 스크립트가 자동화하는 것:
#   [1] 부트스트랩 → [2] 메타데이터 → [4] load (lp-4.js stages 전체) +
#   큐 길이 background polling → [5] cooldown → [5b] logs capture →
#   [6] Prometheus query → [8] cleanup
#
# 본 스크립트가 자동화하지 않는 것 (사람 수동):
#   - [7] 통계 추출 + LP-4_<date>.md 보고서 작성 (PLAN §4 단계 6)
#   - 회복 시간 도출 (queue-depth.jsonl 사후 분석 — baseline 95th percentile
#     이하로 큐 길이가 회복된 시각 식별)
#   - "측정 윈도우 초과" 케이스 → knee point T3 트리거 가능성 (PLAN §3.3 보강)
#
# LP-4 의 [3] warmup 단계 정합:
#   lp-4.js 의 stages 는 [5m@100 + 10s + 30s@1000 + 10s + 5m@100] hard-coded.
#   별도 warmup k6 invocation 없음. W_base_1 5m 의 첫 60s 가 사실상 warmup 역할.
#   분석 단계 6 의 baseline 분포 추출 시 첫 60s 제외 + W_base_1 의 60s~300s
#   구간만 baseline 95th percentile 계산 (PLAN §3.2 "+ warmup 60s = 약 13분"
#   정합).
#
# 사용 예 (호스트 측 수동 실행, 저장소 루트):
#   ./docker/k6/scripts/run-lp-4.sh
#
# 의존성: POSIX shell + docker + docker compose + curl + date + git + jq
#         (jq 는 prom-queries.json + queue-depth.jsonl 디버깅 시 편의용 —
#          본 스크립트 내부 의존 0).

set -eu

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# ---------- cleanup trap ----------
cleanup() {
  rc=$?
  echo ""
  if [ -n "${QUEUE_POLL_PID:-}" ]; then
    kill "${QUEUE_POLL_PID}" 2>/dev/null || true
  fi
  echo "[cleanup] docker compose down -v (trap EXIT, exit code=${rc})"
  docker compose down -v 2>&1 | tail -5 || true
}
trap cleanup EXIT

# ---------- 환경 파라미터 ----------
# LP-4 stages 총 시간 = 10m 50s (lp-4.js 의 stages hard-coded — 본 스크립트
# 는 stages 변경 권한 0, lp-4.js 가 단일 출처).
# Q-LOAD-8 (a) 짧은 + PLAN §4 단계 2 잠금.
W_COOLDOWN_S="${W_COOLDOWN_S:-60}"

# 큐 길이 polling 간격 (PLAN §4 단계 3 — spike 회복 시간 측정 정밀도)
QUEUE_POLL_INTERVAL_S="${QUEUE_POLL_INTERVAL_S:-1}"

# 호스트 측 endpoint
API_URL="${API_URL:-http://localhost:3000}"
WORKER_URL="${WORKER_URL:-http://localhost:3001}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

echo "=== LP-4 spike measurement ==="
echo "Stages (lp-4.js): 5m@100 + 10s ramp + 30s@1000 + 10s ramp + 5m@100 = 10m 50s"
echo "Cooldown: ${W_COOLDOWN_S}s"
echo "Queue depth poll interval: ${QUEUE_POLL_INTERVAL_S}s"

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
  step="${5:-15s}"
  result="$(curl -sf -G "${PROMETHEUS_URL}/api/v1/query_range" \
    --data-urlencode "query=${q}" \
    --data-urlencode "start=${start}" \
    --data-urlencode "end=${end}" \
    --data-urlencode "step=${step}" || echo '{"status":"error","data":null}')"
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

# 큐 길이 polling — background 로 1초 간격 capture.
# 매 sample = 1 jsonl line. 사후 분석 단계 6 이 본 파일에서 baseline 95th
# percentile + spike 최대값 + 회복 시각을 추출.
queue_depth_poller() {
  out="$1"
  interval="$2"
  while true; do
    ts="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
    # 모든 job_state 의 큐 길이 sum
    raw="$(curl -sf -G "${PROMETHEUS_URL}/api/v1/query" \
      --data-urlencode 'query=sum by (job_state) (webhook_relay_queue_depth)' 2>/dev/null \
      || echo '{"status":"error"}')"
    printf '{"ts":"%s","raw":%s}\n' "${ts}" "${raw}" >> "${out}"
    sleep "${interval}"
  done
}

MEASUREMENT_ID="LP-4_$(date -u +%Y-%m-%dT%H-%M-%SZ)"
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
printf 'lp_id: LP-4\n' >> "${RESULTS_DIR}/metadata.yaml"
printf 'rps_base: 100\n' >> "${RESULTS_DIR}/metadata.yaml"
printf 'rps_spike: 1000\n' >> "${RESULTS_DIR}/metadata.yaml"
printf 't_spike_seconds_after_load_start: 300\n' >> "${RESULTS_DIR}/metadata.yaml"
printf 't_spike_end_seconds_after_load_start: 340\n' >> "${RESULTS_DIR}/metadata.yaml"
echo "    -> ${RESULTS_DIR}/metadata.yaml"

# ---------- [4] 부하 인가 (lp-4.js stages 전체) + 큐 길이 polling ----------
# LP-4 는 별도 warmup k6 invocation 없음 — W_base_1 5m 첫 60s 가 사실상 warmup.
# 분석 단계 6 에서 baseline 추출 시 첫 60s 제외.
echo ""
echo "[4] Load (lp-4.js stages 전체 = 10m 50s)"
T_LOAD_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 큐 길이 background polling 시작 (k6 시작부터 cooldown 종료까지 1초 간격 capture)
QUEUE_DEPTH_OUT="${RESULTS_DIR}/queue-depth.jsonl"
echo "" > "${QUEUE_DEPTH_OUT}"
queue_depth_poller "${QUEUE_DEPTH_OUT}" "${QUEUE_POLL_INTERVAL_S}" &
QUEUE_POLL_PID=$!
echo "    Queue depth poller started (PID=${QUEUE_POLL_PID}, interval=${QUEUE_POLL_INTERVAL_S}s)"

docker compose --profile measure run --rm \
  -e STAGE=load \
  k6 run --summary-export="/results/${MEASUREMENT_ID}/k6-load.json" \
    /scenarios/lp-4.js
T_LOAD_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "    load: ${T_LOAD_START} → ${T_LOAD_END}"

printf '%s\n' "${T_LOAD_START}" > "${RESULTS_DIR}/t_start"
printf '%s\n' "${T_LOAD_END}"   > "${RESULTS_DIR}/t_end"

# ---------- [5] 쿨다운 ----------
# 큐 길이 polling 은 cooldown 동안 계속 — 회복이 W_base_2 안에 안 들어와도
# cooldown 안에 들어올 수 있음. cooldown 종료 후에도 회복 안 되면 "측정
# 윈도우 초과" (PLAN §3.3 보강).
echo ""
echo "[5] Cooldown (${W_COOLDOWN_S}s) — queue depth polling 계속"
sleep "${W_COOLDOWN_S}"
T_COOLDOWN_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 큐 길이 polling 종료
kill "${QUEUE_POLL_PID}" 2>/dev/null || true
wait "${QUEUE_POLL_PID}" 2>/dev/null || true
QUEUE_POLL_PID=""
echo "    Queue depth poller stopped (-> ${QUEUE_DEPTH_OUT}, $(wc -l < "${QUEUE_DEPTH_OUT}") samples)"

printf '%s\n' "${T_COOLDOWN_END}" > "${RESULTS_DIR}/t_cooldown_end"

# ---------- [5b] docker compose logs capture ----------
echo ""
echo "[5b] Capture container logs (api + worker)"
docker compose logs api > "${RESULTS_DIR}/api.log" 2>&1 || true
docker compose logs worker > "${RESULTS_DIR}/worker.log" 2>&1 || true
echo "    -> ${RESULTS_DIR}/api.log ($(wc -l < "${RESULTS_DIR}/api.log") lines)"
echo "    -> ${RESULTS_DIR}/worker.log ($(wc -l < "${RESULTS_DIR}/worker.log") lines)"

# ---------- [6] Prometheus query ----------
# spike 구간별 측정값 추출. step=5s 로 spike 영역 정밀도 보강.
echo ""
echo "[6] Prometheus queries (SLO + 구간별 + cardinality + spike RPS 도달)"
PROM_OUT="${RESULTS_DIR}/prom-queries.json"

{
  echo "["
  # ----- 공통 SLO 쿼리 -----
  prom_query_range \
    'sum(rate(webhook_relay_api_requests_total{route="/webhooks",status_class="5xx"}[1m])) / sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[1m]))' \
    'SLO-1_5xx_ratio' \
    "${T_LOAD_START}" "${T_COOLDOWN_END}" "5s"
  echo ","
  prom_query_range \
    'histogram_quantile(0.99, sum by (le) (rate(webhook_relay_api_request_duration_seconds_bucket{route="/webhooks"}[1m])))' \
    'SLO-2_register_latency_p99' \
    "${T_LOAD_START}" "${T_COOLDOWN_END}" "5s"
  echo ","
  prom_query_range \
    'histogram_quantile(0.99, sum by (le) (rate(webhook_relay_worker_processing_duration_seconds_bucket{outcome="success"}[1m])))' \
    'SLO-3_delivery_latency_p99' \
    "${T_LOAD_START}" "${T_COOLDOWN_END}" "5s"
  echo ","
  prom_query_instant \
    'sum(rate(webhook_relay_dlq_jobs_total[1h])) / clamp_min(sum(rate(webhook_relay_jobs_processed_total[1h])), 1)' \
    'SLO-4_dlq_ratio' \
    "${T_COOLDOWN_END}"
  echo ","
  prom_query_range \
    'sum(rate(webhook_relay_jobs_processed_total[1m]))' \
    'throughput_rps' \
    "${T_LOAD_START}" "${T_COOLDOWN_END}" "5s"
  echo ","
  prom_query_instant \
    'count({__name__=~"webhook_relay_.*"})' \
    'cardinality' \
    "${T_COOLDOWN_END}"

  # ----- LP-4 보강: 큐 길이 + 등록 RPS (spike 도달 검증) -----
  # C1 queue_depth — 회복 시간 측정의 핵심
  echo ","
  prom_query_range \
    'sum by (job_state) (webhook_relay_queue_depth)' \
    'C1_queue_depth_by_state' \
    "${T_LOAD_START}" "${T_COOLDOWN_END}" "5s"
  # 등록 RPS achieved — spike 30s 동안 1000 도달 검증 (PLAN §3.3 무효 조건 5
  # — LP-4 spike ±2% = [980, 1020])
  echo ","
  prom_query_range \
    'sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[10s]))' \
    'register_rps_achieved' \
    "${T_LOAD_START}" "${T_COOLDOWN_END}" "5s"
  echo "]"
} > "${PROM_OUT}"

echo "    -> ${PROM_OUT}"

# ---------- [8] cleanup (trap EXIT 가 마저 처리) ----------
echo ""
echo "=== LP-4 measurement complete ==="
echo "Results: ${RESULTS_DIR}/"
echo ""
echo "Next steps (manual — PLAN §4 단계 4 + 단계 6):"
echo "  1. Verify result validity (PLAN §3.3):"
echo "     - Metadata 메타데이터 8 항목 + lp_id + rps_base + rps_spike"
echo "     - spike 30s 동안 RPS achieved ∈ [980, 1020] (LP-4 spike ±2%)"
echo "     - 카디널리티 ≤ 1000 (IT-OBS-11)"
echo "     - Prometheus target up = 0 구간 없음"
echo "  2. Derive baseline + spike + recovery (queue-depth.jsonl 사후 분석):"
echo "     - t_spike_start = t_load_start + 300s (5m, W_base_1 종료)"
echo "     - t_spike_sustained_end = t_load_start + 340s (sustained 30s 종료)"
echo "     - baseline = queue-depth.jsonl 의 [t_load_start + 60s, t_spike_start] 분포의 95th percentile"
echo "     - spike 최대값 = queue-depth.jsonl 의 [t_spike_start, t_spike_sustained_end] 분포의 최대값"
echo "     - t_recovered = t_spike_sustained_end 이후 큐 길이가 baseline 이하로 처음 들어간 시각"
echo "     - 회복 시간 = t_recovered - t_spike_sustained_end"
echo "     - 회복 안 됨 → \"측정 윈도우 초과\" 기록 (PLAN §3.3 보강 — knee point T3 트리거 시사)"
echo "  3. Write report to docs/prd-phase4/results/LP-4_<date>.md (PLAN §4 단계 6)"
echo "  4. Commit + push"
