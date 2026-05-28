#!/usr/bin/env sh
# docker/k6/scripts/run-horizontal-scaling.sh — M-LOAD-5 수평 확장 측정 자동화
# (N ∈ {1, 2, 5, 10} × LP-2 normal sustained, 4 N 순차)
#
# 단일 출처:
# - PRD docs/prd-phase4/04-horizontal-scaling.md §2.1 N 매트릭스 + §4.4 SLO-H-1/H-2 PromQL
# - PRD docs/prd-phase4/03-targets-and-rebaseline.md §3.1 (8 단계 측정 프로토콜)
# - PLAN docs/plan-phase4/06-m-load-5-horizontal-scaling.md §3.2 + §4 단계 1
# - SLO PromQL 단일 출처: docker/prometheus/rules/*.yaml (3단계 잠금)
#
# 본 스크립트가 자동화하는 것 (4 N 매트릭스 × 각 N 8 단계):
#   [1] 부트스트랩 (--scale worker=N) → [2] 메타데이터 → [3] warmup → [4] load →
#   [5] cooldown → [5b] logs capture → [6] Prometheus query → [8] N 사이 Redis flush
#
# 본 스크립트가 자동화하지 않는 것 (사람 수동):
#   - [7] 통계 추출 + horizontal-scaling_<date>.md 보고서 작성 (PLAN §4 단계 3)
#   - 결과 무효 조건 발동 시 재측정 결정 (PLAN §3.4 + PRD `03` §3.4)
#   - N=10 측정 시 Docker VM 메모리 압박 발화 시 PLAN 중단 vs 측정 변수 기록 결정
#     (PLAN §2 자율 일탈 사전 승인 + LP-3 cross-link, 사용자 위임)
#
# 사용 예 (호스트 측 수동 실행, 저장소 루트):
#   ./docker/k6/scripts/run-horizontal-scaling.sh
#   N_VALUES='1 2' ./docker/k6/scripts/run-horizontal-scaling.sh      # 일부만 실행
#   W_LOAD_S=300 ./docker/k6/scripts/run-horizontal-scaling.sh        # 짧은 smoke
#
# 의존성: POSIX shell + docker + docker compose + curl + date + git.
#
# 안전망 (run-lp-2.sh / run-lp-3.sh / run-lp-4.sh 동일 패턴):
#   - set -eu + trap EXIT cleanup
#   - docker compose up --build (stale image 방지)
#   - fail-fast readiness gate (/healthz api + Prometheus targets up >= 2)
#   - [5b] api/worker container logs capture (worker N 인스턴스 합산 로그)
#
# 본 스크립트의 한계 (PLAN §3.4 + 사용자 결정 2026-05-28 정합):
#   - prometheus.yml 의 worker scrape 가 `worker:3001` single target.
#   - N >= 2 시 docker compose service-level DNS round-robin 으로 15s 마다
#     N 인스턴스 중 1개 응답 → counter 가 인스턴스 사이 round-robin 으로 점프.
#   - rate() PromQL + SLO-H-1/H-2 의 정확도 저하. 보고서 단계 3 에 한계 명시
#     + 정확도 사후 분석 (PRD §R4.18 잠정 잠금 "Prometheus 영향 없음" 가정 재검증).
#   - PLAN §5 "prometheus.yml 변경 0건" 잠금 정합 — 본 commit 변경 없음.

set -eu

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# ---------- cleanup trap ----------
cleanup() {
  rc=$?
  echo ""
  echo "[cleanup] docker compose down -v (trap EXIT, exit code=${rc})"
  docker compose down -v 2>&1 | tail -5 || true
}
trap cleanup EXIT

# ---------- 환경 파라미터 ----------
# 측정 윈도우 (PRD `01` §5 + Q-LOAD-8 (b) sustained, LP-2 동일)
W_WARMUP_S="${W_WARMUP_S:-60}"
W_LOAD_S="${W_LOAD_S:-1800}"      # 30m
W_COOLDOWN_S="${W_COOLDOWN_S:-60}"

# LP-2 normal 부하 (PLAN §3.1 + Q-LOAD-6 (b))
RPS="${RPS:-100}"
K6_SEED="${K6_SEED:-0}"

# N 매트릭스 (PRD §2.1 + Q-LOAD-2 + PLAN §3.1 잠금)
N_VALUES="${N_VALUES:-1 2 5 10}"

# 호스트 측 endpoint
API_URL="${API_URL:-http://localhost:3000}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

echo "=== M-LOAD-5 horizontal scaling measurement ==="
echo "N matrix: ${N_VALUES}"
echo "Window per N: warmup=${W_WARMUP_S}s + load=${W_LOAD_S}s + cooldown=${W_COOLDOWN_S}s"
echo "Rate: ${RPS} RPS (VARIANT=normal, K6_SEED=${K6_SEED})"
echo ""
echo "NOTE: prometheus.yml 의 worker scrape 가 single target — N >= 2 시 DNS"
echo "      round-robin 으로 매 scrape 마다 1 인스턴스 응답. 정확도 저하는 단계 3"
echo "      보고서에 명시 (사용자 결정 2026-05-28 잠금)."

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

# ---------- N loop ----------
for N in ${N_VALUES}; do
  echo ""
  echo "=================================================================="
  echo "  N = ${N} workers"
  echo "=================================================================="

  MEASUREMENT_ID="LP-2-N${N}_$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  RESULTS_DIR="docker/k6/results/${MEASUREMENT_ID}"
  mkdir -p "${RESULTS_DIR}"

  # ---------- [1] 부트스트랩 ----------
  echo ""
  echo "[1] Bootstrap — docker compose up -d --build --scale worker=${N}"
  # --build: api/worker 가 host 의 packages/** 최신 코드로 항상 빌드
  # --scale worker=N: SERVICE_MODE=worker 컨테이너 N 인스턴스 기동
  # PRD §I4.20 정합 — 1~2단계 결정 잠금 보존 (SERVICE_MODE + 같은 Redis 큐 공유 소비)
  docker compose up -d --build --scale worker="${N}" redis api worker prometheus grafana

  echo "    Waiting for /healthz 200 (api) ..."
  wait_for_curl_ok "${API_URL}/healthz" "api" 30 || exit 1

  echo "    Waiting for Prometheus targets up >= 2 (api + worker job groups) ..."
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
  printf 'lp_id: LP-2\n' >> "${RESULTS_DIR}/metadata.yaml"
  printf 'rps: %s\n' "${RPS}" >> "${RESULTS_DIR}/metadata.yaml"
  printf 'variant: normal\n' >> "${RESULTS_DIR}/metadata.yaml"
  printf 'k6_seed: %s\n' "${K6_SEED}" >> "${RESULTS_DIR}/metadata.yaml"
  printf 'worker_count: %s\n' "${N}" >> "${RESULTS_DIR}/metadata.yaml"
  echo "    -> ${RESULTS_DIR}/metadata.yaml"

  # ---------- [3] 워밍업 ----------
  echo ""
  echo "[3] Warmup (${W_WARMUP_S}s, RPS=${RPS}, VARIANT=normal, N=${N})"
  T_WARMUP_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker compose --profile measure run --rm \
    -e STAGE=warmup \
    -e DURATION="${W_WARMUP_S}s" \
    -e RPS="${RPS}" \
    -e VARIANT=normal \
    -e K6_SEED="${K6_SEED}" \
    k6 run --summary-export="/results/${MEASUREMENT_ID}/k6-warmup.json" \
      /scenarios/lp-2.js
  T_WARMUP_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "    warmup: ${T_WARMUP_START} → ${T_WARMUP_END}"

  # ---------- [4] 부하 인가 ----------
  echo ""
  echo "[4] Load (${W_LOAD_S}s, RPS=${RPS}, VARIANT=normal, N=${N})"
  T_LOAD_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker compose --profile measure run --rm \
    -e STAGE=load \
    -e DURATION="${W_LOAD_S}s" \
    -e RPS="${RPS}" \
    -e VARIANT=normal \
    -e K6_SEED="${K6_SEED}" \
    k6 run --summary-export="/results/${MEASUREMENT_ID}/k6-load.json" \
      /scenarios/lp-2.js
  T_LOAD_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "    load: ${T_LOAD_START} → ${T_LOAD_END}"

  printf '%s\n' "${T_LOAD_START}" > "${RESULTS_DIR}/t_start"
  printf '%s\n' "${T_LOAD_END}"   > "${RESULTS_DIR}/t_end"

  # ---------- [5] 쿨다운 ----------
  echo ""
  echo "[5] Cooldown (${W_COOLDOWN_S}s)"
  sleep "${W_COOLDOWN_S}"

  # ---------- [5b] docker compose logs capture ----------
  # M-LOAD-3 단계 4 재측정 debug cross-link — api / worker stdout/stderr 보존.
  # N >= 2 시 worker.log 는 N 인스턴스의 통합 로그 (docker compose logs worker).
  echo ""
  echo "[5b] Capture container logs (api + worker N=${N} 통합)"
  docker compose logs api > "${RESULTS_DIR}/api.log" 2>&1 || true
  docker compose logs worker > "${RESULTS_DIR}/worker.log" 2>&1 || true
  echo "    -> ${RESULTS_DIR}/api.log ($(wc -l < "${RESULTS_DIR}/api.log") lines)"
  echo "    -> ${RESULTS_DIR}/worker.log ($(wc -l < "${RESULTS_DIR}/worker.log") lines)"

  # ---------- [6] Prometheus query ----------
  # SLO PromQL 단일 출처: docker/prometheus/rules/*.yaml (3단계 잠금).
  # SLO-H-1/H-2 PromQL: PRD §4.4 + PLAN §3.3.
  echo ""
  echo "[6] Prometheus queries (SLO + SLO-H-1/H-2 + throughput + cardinality)"
  PROM_OUT="${RESULTS_DIR}/prom-queries.json"

  {
    echo "["
    # ----- 공통 SLO 쿼리 (LP-2 LP-3 mirror) -----
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

    # ----- SLO-H-1 / SLO-H-2 (PRD §4.4 SLI PromQL) -----
    # SLO-H-1 처리량 선형성: sum(rate(jobs_processed_total{completed}[5m])) 의 W_load 평균
    echo ","
    prom_query_range \
      'sum(rate(webhook_relay_jobs_processed_total{job_state="completed"}[5m]))' \
      'SLO-H-1_throughput_completed' \
      "${T_LOAD_START}" "${T_LOAD_END}"
    # SLO-H-2 p99 안정성: histogram_quantile(0.99, ...) 의 W_load 평균
    echo ","
    prom_query_range \
      'histogram_quantile(0.99, sum by (le) (rate(webhook_relay_worker_processing_duration_seconds_bucket{outcome="success"}[5m])))' \
      'SLO-H-2_p99_processing' \
      "${T_LOAD_START}" "${T_LOAD_END}"

    # ----- N 보강: 큐 길이 + 등록 RPS achieved + scrape coverage -----
    # C1 queue_depth — N 별 처리 capacity 의 함수 형태
    echo ","
    prom_query_range \
      'sum by (job_state) (webhook_relay_queue_depth)' \
      'C1_queue_depth_by_state' \
      "${T_LOAD_START}" "${T_LOAD_END}"
    # 등록 RPS achieved (PLAN §3.4 결과 무효 조건 — LP-2 ±2% = [98, 102])
    echo ","
    prom_query_range \
      'sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[5m]))' \
      'register_rps_achieved' \
      "${T_LOAD_START}" "${T_LOAD_END}"
    # Prometheus scrape coverage — worker job 의 up{} 시계열 평균.
    # single target round-robin 으로 매 scrape 마다 1 인스턴스 응답이지만
    # up{} 은 항상 1 (응답 성공 여부) — N 인스턴스 추적 신호로는 약함.
    # 본 query 는 PRD §R4.18 검증 신호 (W_load 안에 up=0 구간 존재 여부).
    echo ","
    prom_query_range \
      'min(up{job="webhook-relay-worker"})' \
      'scrape_worker_up_min' \
      "${T_LOAD_START}" "${T_LOAD_END}"
    echo "]"
  } > "${PROM_OUT}"

  echo "    -> ${PROM_OUT}"

  # ---------- [8] N 사이 Redis flush ----------
  # PLAN §3.2 정합 — 다음 N 이 깨끗한 상태로 시작.
  echo ""
  echo "[8] Cleanup before next N — docker compose down -v"
  docker compose down -v 2>&1 | tail -5
done

echo ""
echo "=== All N values complete: ${N_VALUES} ==="
echo "Results:"
for N in ${N_VALUES}; do
  d="$(ls -d "docker/k6/results/LP-2-N${N}_"* 2>/dev/null | tail -1)"
  if [ -n "${d}" ]; then
    echo "  ${d}/"
  fi
done
echo ""
echo "Next steps (manual — PLAN 'docs/plan-phase4/06-m-load-5-horizontal-scaling.md' §4 단계 2/3):"
echo "  1. Verify result validity per N (PLAN §3.4):"
echo "     - Metadata 8 fields + lp_id + rps + variant + k6_seed + worker_count"
echo "     - RPS achieved per N ∈ [98, 102] (LP-2 normal ±2%)"
echo "     - Prometheus scrape_worker_up_min == 1 (W_load 안에 up=0 구간 없음)"
echo "     - Cardinality ≤ 1000 (IT-OBS-11)"
echo "     - 측정 분산 ±5% 안 (4 N 각각)"
echo "  2. Identify horizontal scaling SLO results:"
echo "     - SLO-H-1 처리량 선형성: throughput(N) >= throughput(1) * N * 0.8 (alpha=0.8)"
echo "     - SLO-H-2 p99 안정성: p99(N) <= p99(1) * 1.2 (beta=1.2)"
echo "     - 위반 N 의 사유 분류 (자원 경합 / Redis 포화 / cgroup 한정값 과소)"
echo "  3. 정확도 한계 분석 (사용자 결정 잠금 정합):"
echo "     - prometheus.yml worker single target round-robin scrape 영향 평가"
echo "     - throughput(N) 의 신뢰 구간 + N=1 대비 측정값의 SLO-H-1/H-2 의 의미 보존성"
echo "  4. Write report: docs/prd-phase4/results/horizontal-scaling_<date>.md"
echo "  5. Commit + push"
