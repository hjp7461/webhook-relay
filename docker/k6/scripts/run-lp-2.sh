#!/usr/bin/env sh
# docker/k6/scripts/run-lp-2.sh — LP-2 nominal sustained 측정 자동화
# (4 변형 × 8 단계 프로토콜)
#
# 단일 출처:
# - PRD docs/prd-phase4/01-load-profiles.md §3.1 LP-2 + §6 IT-S 매핑표
# - PRD docs/prd-phase4/03-targets-and-rebaseline.md §3.1 (8 단계 측정 프로토콜)
# - PLAN docs/plan-phase4/04-m-load-3-lp2-nominal.md §3.2 + §4 단계 3
# - PLAN docs/plan-phase4/08-cross-cutting.md §5 (변형 사이 Redis flush)
# - SLO PromQL 단일 출처: docker/prometheus/rules/*.yaml (3단계 잠금)
#
# 본 스크립트가 자동화하는 것 (4 변형 × 각 변형 8 단계):
#   [1] 부트스트랩 → [2] 메타데이터 → [3] warmup → [4] load → [5] cooldown →
#   [6] Prometheus query → [8] 변형 사이 Redis flush
#
# 본 스크립트가 자동화하지 않는 것 (사람 수동):
#   - [7] 통계 추출 + LP-2_<date>.md 보고서 작성 (PLAN §4 단계 5)
#   - 결과 무효 조건 발동 시 재측정 결정 (PLAN §3.3 + PRD `03` §3.4)
#
# 사용 예 (호스트 측 수동 실행, 저장소 루트):
#   ./docker/k6/scripts/run-lp-2.sh
#   VARIANTS='normal s3' ./docker/k6/scripts/run-lp-2.sh   # 일부만 실행
#   W_LOAD_S=300 ./docker/k6/scripts/run-lp-2.sh           # 짧은 smoke
#
# 의존성: POSIX shell + docker + docker compose + curl + date + git.
#
# 안전망 (M-LOAD-2 발견 사항 cross-link):
#   - set -eu + trap EXIT cleanup — 중도 실패에도 컨테이너 정리.
#   - docker compose up --build — stale image (M-OBS-1 이전 빌드) 재사용 방지.
#   - fail-fast readiness gate — /healthz / /metrics / Prometheus targets up.

set -eu

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# ---------- cleanup trap ----------
# 측정 중도 실패(set -e) 에도 컨테이너 정리 보장 — 단일 cleanup 책임.
# 변형 사이의 명시적 `docker compose down -v` ([8] 단계) 와 별개로,
# 본 trap 은 최종 종료 또는 중도 실패 시의 안전망.
cleanup() {
  rc=$?
  echo ""
  echo "[cleanup] docker compose down -v (trap EXIT, exit code=${rc})"
  docker compose down -v 2>&1 | tail -5 || true
}
trap cleanup EXIT

# ---------- 환경 파라미터 ----------
# 측정 윈도우 (PRD `01` §5 + Q-LOAD-8 (b) sustained)
W_WARMUP_S="${W_WARMUP_S:-60}"
W_LOAD_S="${W_LOAD_S:-1800}"      # 30m
W_COOLDOWN_S="${W_COOLDOWN_S:-60}"

# 부하 파라미터 (PRD `01` §3.1 LP-2 + Q-LOAD-6 (b) 중도 셋)
RPS="${RPS:-100}"

# 변형 — 공백 구분. PRD §6 IT-S 매핑표 잠금.
VARIANTS="${VARIANTS:-normal s3 s4 s5}"

# 결정성 시드 (lp-2.js 의 K6_SEED env, 단계 1 commit 19b9b7f 잠금)
K6_SEED="${K6_SEED:-0}"

# 호스트 측 endpoint (docker-compose 의 외부 포트 매핑)
API_URL="${API_URL:-http://localhost:3000}"
WORKER_URL="${WORKER_URL:-http://localhost:3001}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

echo "=== LP-2 nominal sustained measurement ==="
echo "Variants: ${VARIANTS}"
echo "Window per variant: warmup=${W_WARMUP_S}s + load=${W_LOAD_S}s + cooldown=${W_COOLDOWN_S}s"
echo "Rate: ${RPS} RPS"
echo "K6_SEED: ${K6_SEED}"

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

# ---------- variant loop ----------
for VARIANT in ${VARIANTS}; do
  echo ""
  echo "=================================================================="
  echo "  Variant: ${VARIANT}"
  echo "=================================================================="

  MEASUREMENT_ID="LP-2-${VARIANT}_$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  RESULTS_DIR="docker/k6/results/${MEASUREMENT_ID}"
  mkdir -p "${RESULTS_DIR}"

  # ---------- [1] 부트스트랩 ----------
  echo ""
  echo "[1] Bootstrap — docker compose up -d --build (5 services, k6 excluded)"
  # --build: api/worker 가 host 의 packages/** 최신 코드로 항상 빌드된다
  # (run-lp-1.sh fix 11bdd0d 와 동일 — stale image silent staleness 방지).
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
  # 변형 + 시드를 metadata.yaml 에 같이 보존 (보고서 단계에서 cross-link 용이).
  printf 'variant: %s\n' "${VARIANT}" >> "${RESULTS_DIR}/metadata.yaml"
  printf 'k6_seed: %s\n' "${K6_SEED}" >> "${RESULTS_DIR}/metadata.yaml"
  echo "    -> ${RESULTS_DIR}/metadata.yaml"

  # ---------- [3] 워밍업 ----------
  echo ""
  echo "[3] Warmup (${W_WARMUP_S}s, RPS=${RPS}, VARIANT=${VARIANT})"
  T_WARMUP_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker compose --profile measure run --rm \
    -e STAGE=warmup \
    -e DURATION="${W_WARMUP_S}s" \
    -e RPS="${RPS}" \
    -e VARIANT="${VARIANT}" \
    -e K6_SEED="${K6_SEED}" \
    k6 run --summary-export="/results/${MEASUREMENT_ID}/k6-warmup.json" \
      /scenarios/lp-2.js
  T_WARMUP_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "    warmup: ${T_WARMUP_START} → ${T_WARMUP_END}"

  # ---------- [4] 부하 인가 ----------
  echo ""
  echo "[4] Load (${W_LOAD_S}s, RPS=${RPS}, P=80/15/5, VARIANT=${VARIANT})"
  T_LOAD_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  docker compose --profile measure run --rm \
    -e STAGE=load \
    -e DURATION="${W_LOAD_S}s" \
    -e RPS="${RPS}" \
    -e VARIANT="${VARIANT}" \
    -e K6_SEED="${K6_SEED}" \
    k6 run --summary-export="/results/${MEASUREMENT_ID}/k6-load.json" \
      /scenarios/lp-2.js
  T_LOAD_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "    load: ${T_LOAD_START} → ${T_LOAD_END}"

  # t_start / t_end 기록 (load 단계 = SLI 계산 범위, PLAN 08 §3 정합)
  printf '%s\n' "${T_LOAD_START}" > "${RESULTS_DIR}/t_start"
  printf '%s\n' "${T_LOAD_END}"   > "${RESULTS_DIR}/t_end"

  # ---------- [5] 쿨다운 ----------
  echo ""
  echo "[5] Cooldown (${W_COOLDOWN_S}s)"
  sleep "${W_COOLDOWN_S}"

  # ---------- [5b] docker compose logs capture (debug) ----------
  # M-LOAD-3 단계 4 재측정 debug — receiver / worker container 의 stdout/stderr
  # 를 결과 디렉터리에 보존. variant 분기 발화 + worker fetch 시 url query
  # 보존 결정적 검증 (LP-2-S3 W3 attempts ≈ 1 root cause cross-link).
  echo ""
  echo "[5b] Capture container logs (api + worker)"
  docker compose logs api > "${RESULTS_DIR}/api.log" 2>&1 || true
  docker compose logs worker > "${RESULTS_DIR}/worker.log" 2>&1 || true
  echo "    -> ${RESULTS_DIR}/api.log ($(wc -l < "${RESULTS_DIR}/api.log") lines)"
  echo "    -> ${RESULTS_DIR}/worker.log ($(wc -l < "${RESULTS_DIR}/worker.log") lines)"

  # ---------- [6] Prometheus query ----------
  # PromQL 단일 출처: docker/prometheus/rules/*.yaml (3단계 잠금).
  # SLI 형태(메트릭 이름 / 라벨 / 집계 함수) + 측정 윈도우 변경 금지(I6.1/I6.2).
  # 본 스크립트는 4단계 measurement 측 컨슈머로서 라벨/집계 그대로.
  echo ""
  echo "[6] Prometheus queries (SLO-1~4 + throughput + cardinality + variant-specific)"
  PROM_OUT="${RESULTS_DIR}/prom-queries.json"

  {
    echo "["
    # ----- 공통 SLO 쿼리 (LP-1 동일) -----
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

    # ----- 변형별 추가 쿼리 (PLAN §3.3 결과 무효 조건 보강) -----
    case "${VARIANT}" in
      normal)
        # D3 페이로드 분포 (80/15/5 검증)
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
        ;;
      s3)
        # W3 attempts 분포 평균 (~3 근처) + C3 retriable_error rate
        echo ","
        prom_query_range \
          'rate(webhook_relay_delivery_attempts_per_job_sum[5m]) / clamp_min(rate(webhook_relay_delivery_attempts_per_job_count[5m]), 1)' \
          'W3_attempts_avg' \
          "${T_LOAD_START}" "${T_LOAD_END}"
        echo ","
        prom_query_range \
          'sum(rate(webhook_relay_deliveries_total{result="http_error",error_class="RetriableError"}[5m]))' \
          'C3_retriable_error_rate' \
          "${T_LOAD_START}" "${T_LOAD_END}"
        ;;
      s4)
        # SLO-4 절대값 (~100% 근처) + C5 max_attempts_exceeded rate
        echo ","
        prom_query_range \
          'sum(rate(webhook_relay_dlq_jobs_total{reason="max_attempts_exceeded"}[5m]))' \
          'C5_max_attempts_exceeded_rate' \
          "${T_LOAD_START}" "${T_LOAD_END}"
        ;;
      s5)
        # C5 non_retriable count + W3 attempts=1 분포
        echo ","
        prom_query_range \
          'sum(rate(webhook_relay_dlq_jobs_total{reason="non_retriable"}[5m]))' \
          'C5_non_retriable_rate' \
          "${T_LOAD_START}" "${T_LOAD_END}"
        ;;
    esac
    echo "]"
  } > "${PROM_OUT}"

  echo "    -> ${PROM_OUT}"

  # ---------- [8] 변형 사이 Redis flush ----------
  # PLAN 08-cross-cutting.md §5 정합 — 다음 변형이 깨끗한 상태로 시작.
  # trap cleanup() 도 마지막 변형 후 한 번 더 실행되지만 idempotent.
  echo ""
  echo "[8] Cleanup before next variant — docker compose down -v"
  docker compose down -v 2>&1 | tail -5
done

echo ""
echo "=== All variants complete: ${VARIANTS} ==="
echo "Results:"
for VARIANT in ${VARIANTS}; do
  d="$(ls -d "docker/k6/results/LP-2-${VARIANT}_"* 2>/dev/null | tail -1)"
  if [ -n "${d}" ]; then
    echo "  ${d}/"
  fi
done
echo ""
echo "Next steps (manual — PLAN §4 단계 4 + 단계 5):"
echo "  1. Verify result validity per variant (PLAN §3.3):"
echo "     - Metadata 8 fields present + variant + k6_seed"
echo "     - RPS achieved ∈ [98, 102] per variant"
echo "     - Variant-specific guards (PLAN §3.3 결과 무효 조건 보강):"
echo "         * normal: D3 payload 분포가 80/15/5 의도 일치"
echo "         * s3:     W3 attempts avg ≈ 3 (K=2 의 결과 = 1 + 2 = 3)"
echo "         * s4:     SLO-4 DLQ 적재율 ≈ 1.0 (모든 작업 max_attempts_exceeded)"
echo "         * s5:     C5 non_retriable count == ingested jobs (1 attempt)"
echo "     - 측정 분산 ±5% 안 (PRD 02 §7.2)"
echo "  2. Write report to docs/prd-phase4/results/LP-2_<date>.md (PLAN §4 단계 5)"
echo "  3. Commit + push"
