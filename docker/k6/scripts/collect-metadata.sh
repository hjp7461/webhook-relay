#!/usr/bin/env sh
# collect-metadata.sh — 측정 호스트 메타데이터를 YAML 형식으로 stdout 에 출력.
#
# 단일 출처: PRD `docs/prd-phase4/02-measurement-tools-and-environment.md`
#   §5.1 (필수 8 항목 표) + §5.2 (YAML 형식 예시).
# PLAN 정합: `docs/plan-phase4/02-m-load-1-bootstrap.md` §4 단계 4.
#
# 본 헬퍼가 수집하는 항목:
#   - 측정 호스트 CPU 모델 / 주파수(GHz) / RAM(GB) / OS
#   - Docker 버전 (Server + Client)
#   - k6 버전 (docker compose run --rm k6 version 으로 추출)
#   - git commit SHA (HEAD)
#   - 측정 시작 일시 (ISO 8601 UTC)
#   - 호스트명 (PRD §5.1 표 외 추가 자유 항목, 추적성 강화)
#
# 본 헬퍼가 채우지 않는 항목 (측정 실행 스크립트가 M-LOAD-2 부터 별도 갱신):
#   - measurement.id / ended_at
#   - cgroup 한정값 / redis_topology / load_profile
#
# 사용 예 (호스트 측 수동 실행):
#   ./docker/k6/scripts/collect-metadata.sh > docker/k6/results/<id>/metadata.yaml
#
# 의존성: POSIX shell + uname / sysctl(macOS) / lscpu(Linux) / git / docker /
#   hostname. pnpm / node 호출 0건 (PLAN §4 단계 4 금지 정합).
# 본 헬퍼는 호스트 측에서 실행되며 컨테이너 안에서 실행되지 않는다.

set -eu

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

OS_KERNEL="$(uname -s)"
OS_REL="$(uname -r)"
HOSTNAME_RAW="$(hostname)"

case "$OS_KERNEL" in
  Darwin)
    CPU_MODEL="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo unknown)"
    CPU_GHZ="$(echo "$CPU_MODEL" | sed -nE 's/.*@ ([0-9.]+)GHz.*/\1/p')"
    CPU_GHZ="${CPU_GHZ:-unknown}"
    RAM_BYTES="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
    RAM_GB="$(awk "BEGIN { printf \"%d\", $RAM_BYTES / 1024 / 1024 / 1024 }")"
    OS_NAME="macOS $(sw_vers -productVersion 2>/dev/null || echo unknown) (Darwin $OS_REL)"
    ;;
  Linux)
    CPU_MODEL="$(lscpu 2>/dev/null | awk -F': +' '/^Model name/ {print $2; exit}')"
    CPU_MODEL="${CPU_MODEL:-unknown}"
    CPU_GHZ_MHZ="$(lscpu 2>/dev/null | awk -F': +' '/^CPU MHz/ {print $2; exit}')"
    if [ -n "${CPU_GHZ_MHZ:-}" ]; then
      CPU_GHZ="$(awk "BEGIN { printf \"%.2f\", $CPU_GHZ_MHZ / 1000 }")"
    else
      CPU_GHZ="$(echo "$CPU_MODEL" | sed -nE 's/.*@ ([0-9.]+)GHz.*/\1/p')"
      CPU_GHZ="${CPU_GHZ:-unknown}"
    fi
    RAM_KB="$(awk '/^MemTotal/ {print $2; exit}' /proc/meminfo 2>/dev/null || echo 0)"
    RAM_GB="$(awk "BEGIN { printf \"%d\", $RAM_KB / 1024 / 1024 }")"
    OS_PRETTY=""
    if [ -f /etc/os-release ]; then
      OS_PRETTY="$(awk -F= '/^PRETTY_NAME=/ {gsub(/"/, "", $2); print $2; exit}' /etc/os-release)"
    fi
    OS_NAME="${OS_PRETTY:-Linux} ($OS_KERNEL $OS_REL)"
    ;;
  *)
    CPU_MODEL="unknown"
    CPU_GHZ="unknown"
    RAM_GB="0"
    OS_NAME="$OS_KERNEL $OS_REL"
    ;;
esac

DOCKER_SERVER="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo unknown)"
DOCKER_CLIENT="$(docker version --format '{{.Client.Version}}' 2>/dev/null || echo unknown)"

# k6 버전: measure profile 의 k6 컨테이너에서 추출. compose context 에서
# 실행해야 동작 — 본 헬퍼를 저장소 루트에서 호출하면 자동 인식.
K6_VERSION="$(cd "$REPO_ROOT" && docker compose --profile measure run --rm --no-deps k6 version 2>/dev/null | head -1 || echo unknown)"

GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat <<YAML
measurement:
  # id / ended_at / cgroup / redis_topology / load_profile 은 측정 실행
  # 스크립트(M-LOAD-2 부터)가 별도 갱신한다. 본 헬퍼는 호스트/도구/시작 시점만 출력.
  started_at: $STARTED_AT
  git_commit: $GIT_COMMIT
  hostname: "$HOSTNAME_RAW"
  host:
    cpu_model: "$CPU_MODEL"
    cpu_ghz: $CPU_GHZ
    ram_gb: $RAM_GB
    os: "$OS_NAME"
  docker_version: "Server $DOCKER_SERVER (Client $DOCKER_CLIENT)"
  k6_version: "$K6_VERSION"
YAML
