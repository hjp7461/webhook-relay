#!/usr/bin/env sh
# docker/k6/scripts/run-lp-1.sh — LP-1 baseline 측정 자동화 (8 단계 프로토콜)
#
# 단일 출처:
# - PRD docs/prd-phase4/03-targets-and-rebaseline.md §3.1 (8 단계 측정 프로토콜)
# - PRD docs/prd-phase4/03-targets-and-rebaseline.md §3.2 (Prometheus query 형태)
# - PLAN docs/plan-phase4/03-m-load-2-lp1-baseline.md §3.2 + §4 단계 2
# - PLAN docs/plan-phase4/08-cross-cutting.md §1 (메타데이터 강제) + §5 (Redis flush)
# - SLO PromQL 단일 출처: docker/prometheus/rules/*.yaml (3단계 잠금)
#
# 본 스크립트가 자동화하는 것:
#   [1] 부트스트랩 → [2] 메타데이터 → [3] warmup → [4] load → [5] cooldown →
#   [6] Prometheus query → [8] 정리
#
# 본 스크립트가 자동화하지 않는 것 (사람 수동):
#   - [7] 통계 추출 + LP-1_<date>.md 보고서 작성 (PRD `02` §6.3 + PLAN §4 단계 5)
#   - 결과 무효 조건 발동 시 재측정 결정 (PRD `03` §3.4 + PLAN §3.3)
#   - .gitignore 결정 (PLAN §4 단계 6)
#
# 사용 예 (호스트 측 수동 실행, 저장소 루트):
#   ./docker/k6/scripts/run-lp-1.sh
#   MEASUREMENT_ID=LP-1_2026-05-27_manual ./docker/k6/scripts/run-lp-1.sh
#
# 의존성: POSIX shell + docker + docker compose + curl + date + git.

set -eu

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# ---------- cleanup trap ----------
# 측정 중도 실패(set -e) 에도 컨테이너 정리 보장 — 단일 cleanup 책임.
# [8] 단계의 explicit cleanup 은 본 trap 이 흡수 (PLAN 08-cross-cutting.md §5
# Redis flush + 측정 격리 정합).
cleanup() {
  rc=$?
  echo ""
  echo "[cleanup] docker compose down -v (trap EXIT, exit code=${rc})"
  docker compose down -v 2>&1 | tail -5 || true
}
trap cleanup EXIT

# ---------- 환경 파라미터 ----------
MEASUREMENT_ID="${MEASUREMENT_ID:-LP-1_$(date -u +%Y-%m-%dT%H-%M-%SZ)}"
RESULTS_DIR="docker/k6/results/${MEASUREMENT_ID}"
mkdir -p "$RESULTS_DIR"

# 측정 윈도우 (PRD `01` §5 Q-LOAD-8 (a) 짧은 측정)
W_WARMUP_S="${W_WARMUP_S:-60}"
W_LOAD_S="${W_LOAD_S:-300}"      # 5m
W_COOLDOWN_S="${W_COOLDOWN_S:-30}"

# 부하 파라미터 (PRD `01` §3.1 LP-1 + Q-LOAD-6 (b) 중도 셋)
RPS="${RPS:-10}"

# 호스트 측 endpoint (docker-compose 의 외부 포트 매핑)
API_URL="${API_URL:-http://localhost:3000}"
WORKER_URL="${WORKER_URL:-http://localhost:3001}"
PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"

echo "=== LP-1 baseline measurement: ${MEASUREMENT_ID} ==="
echo "Results directory: ${RESULTS_DIR}"
echo "Window: warmup=${W_WARMUP_S}s + load=${W_LOAD_S}s + cooldown=${W_COOLDOWN_S}s"
echo "Rate: ${RPS} RPS"

# ---------- [1] 부트스트랩 ----------
echo ""
echo "[1] Bootstrap — docker compose up -d --build (5 services, k6 excluded)"
# --build: api/worker 가 host 의 packages/** 최신 코드로 항상 빌드된다.
# 본 플래그가 없으면 stale image (e.g. M-OBS-1 이전 빌드) 가 cache 로 재사용되어
# /metrics 라우트 누락 등의 잠재 회귀가 silent 로 진행될 위험. cache hit 시
# 빌드는 1~3초로 끝나므로 매 측정에 부담 없음.
docker compose up -d --build redis api worker prometheus grafana

echo "    Waiting for /healthz 200 (api) ..."
api_ready=0
for i in $(seq 1 30); do
  if curl -sf "${API_URL}/healthz" > /dev/null 2>&1; then
    echo "    api ready (attempt $i)"
    api_ready=1
    break
  fi
  sleep 2
done
if [ "${api_ready}" -ne 1 ]; then
  echo "    api /healthz NOT ready after 30 attempts (60s)" >&2
  exit 1
fi

echo "    Waiting for /metrics 200 (worker) ..."
worker_ready=0
for i in $(seq 1 30); do
  if curl -sf "${WORKER_URL}/metrics" > /dev/null 2>&1; then
    echo "    worker ready (attempt $i)"
    worker_ready=1
    break
  fi
  sleep 2
done
if [ "${worker_ready}" -ne 1 ]; then
  echo "    worker /metrics NOT ready after 30 attempts (60s)" >&2
  exit 1
fi

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
    /scenarios/lp-1.js
T_WARMUP_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "    warmup: ${T_WARMUP_START} → ${T_WARMUP_END}"

# ---------- [4] 부하 인가 ----------
echo ""
echo "[4] Load (${W_LOAD_S}s, RPS=${RPS}, P=small 1KB)"
T_LOAD_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose --profile measure run --rm \
  -e STAGE=load \
  -e DURATION="${W_LOAD_S}s" \
  -e RPS="${RPS}" \
  k6 run --summary-export="/results/${MEASUREMENT_ID}/k6-load.json" \
    /scenarios/lp-1.js
T_LOAD_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "    load: ${T_LOAD_START} → ${T_LOAD_END}"

# t_start / t_end 기록 (load 단계 = SLI 계산 범위, PLAN 08 §3 정합)
printf '%s\n' "${T_LOAD_START}" > "${RESULTS_DIR}/t_start"
printf '%s\n' "${T_LOAD_END}"   > "${RESULTS_DIR}/t_end"

# ---------- [5] 쿨다운 ----------
echo ""
echo "[5] Cooldown (${W_COOLDOWN_S}s)"
sleep "${W_COOLDOWN_S}"

# ---------- [6] Prometheus query ----------
# PromQL 단일 출처: docker/prometheus/rules/*.yaml (3단계 잠금).
# SLI 형태(메트릭 이름 / 라벨 / 집계 함수) + 측정 윈도우([5m] / [1h]) 변경 금지
# (I6.1 / I6.2). 본 스크립트는 4단계 measurement 측 컨슈머로서 라벨/집계 그대로.
echo ""
echo "[6] Prometheus queries (SLO-1~4 + throughput + cardinality)"
PROM_OUT="${RESULTS_DIR}/prom-queries.json"

# PromQL 쿼리 본문은 결과 JSON 안에 포함하지 않는다 (escape 복잡성 + 단일
# 출처 분리). 결과 보고서 작성 시 본 스크립트 + docker/prometheus/rules/*.yaml
# 의 PromQL 본문을 직접 인용한다. 본 JSON 은 label + Prometheus 응답만 보존.
prom_query_range() {
  q="$1"
  label="$2"
  result="$(curl -sf -G "${PROMETHEUS_URL}/api/v1/query_range" \
    --data-urlencode "query=${q}" \
    --data-urlencode "start=${T_LOAD_START}" \
    --data-urlencode "end=${T_LOAD_END}" \
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

{
  echo "["
  prom_query_range \
    'sum(rate(webhook_relay_api_requests_total{route="/webhooks",status_class="5xx"}[5m])) / sum(rate(webhook_relay_api_requests_total{route="/webhooks"}[5m]))' \
    'SLO-1_5xx_ratio'
  echo ","
  prom_query_range \
    'histogram_quantile(0.99, sum by (le) (rate(webhook_relay_api_request_duration_seconds_bucket{route="/webhooks"}[5m])))' \
    'SLO-2_register_latency_p99'
  echo ","
  prom_query_range \
    'histogram_quantile(0.99, sum by (le) (rate(webhook_relay_worker_processing_duration_seconds_bucket{outcome="success"}[5m])))' \
    'SLO-3_delivery_latency_p99'
  echo ","
  prom_query_instant \
    'sum(rate(webhook_relay_dlq_jobs_total[1h])) / clamp_min(sum(rate(webhook_relay_jobs_processed_total[1h])), 1)' \
    'SLO-4_dlq_ratio' \
    "${T_LOAD_END}"
  echo ","
  prom_query_range \
    'sum(rate(webhook_relay_jobs_processed_total[5m]))' \
    'throughput_rps'
  echo ","
  prom_query_instant \
    'count({__name__=~"webhook_relay_.*"})' \
    'cardinality' \
    "${T_LOAD_END}"
  echo "]"
} > "${PROM_OUT}"

echo "    -> ${PROM_OUT}"

# ---------- [8] 정리 — trap EXIT 이 책임 ----------
# explicit `docker compose down -v` 는 trap cleanup() 으로 이관 (단일 출처).
# 본 단계 도달 시점에 측정은 완료 — trap 이 정상 종료 cleanup 처리.

echo ""
echo "=== Measurement complete ==="
echo "Results: ${RESULTS_DIR}/"
echo ""
echo "Next steps (manual — PLAN §4 단계 4 + 단계 5):"
echo "  1. Verify result validity (PLAN §3.3):"
echo "     - Metadata 8 fields present: cat ${RESULTS_DIR}/metadata.yaml"
echo "     - RPS achieved ∈ [9.8, 10.2]: jq '.metrics.http_reqs' ${RESULTS_DIR}/k6-load.json"
echo "     - Prometheus targets up=1 maintained (Grafana dashboard)"
echo "  2. Write report to docs/prd-phase4/results/LP-1_<date>.md (PLAN §4 단계 5)"
echo "  3. Commit + push"
