# 02. Measurement Tools & Environment — k6 잠금 · cgroup 격리 · 메타데이터 · 결과 보존

> 담당 페르소나: **Performance Engineer** · Architect 보조 (도구 의존성 경계)
> 본 문서는 4단계 PRD 의 측정 도구(k6) + 측정 환경(로컬 + cgroup 격리) + 결과 보존
> 형식의 단일 출처를 잠근다. `01` 이 정의한 LP-N 카탈로그가 본 문서 환경에서 실행된다.
> 구현 코드(k6 시나리오 파일, docker-compose k6 서비스 추가, 결과 자동화) 는
> 본 PRD 가 승인된 뒤 **후속 PLAN 단계** 에서 작성한다.

---

## 1. 컨텍스트 / 배경

부하 측정의 신뢰성은 두 가지 축에 의존한다.

1. **측정 도구의 정확성** — 의도한 RPS / 페이로드 / 패턴이 실제로 인가되는가.
2. **측정 환경의 격리성** — 호스트 노이즈 / 다른 프로세스 / 자원 경합이 측정 결과에
   섞이지 않는가.

본 PRD 는 두 축의 결정을 사용자가 사전에 잠금했다(Q-LOAD-1 / Q-LOAD-2 Resolved
2026-05-27, `00-decisions-needed.md` §🔴). 본 문서는 그 잠금의 단일 출처다.

- **Q-LOAD-1 (a) k6 잠금** — Grafana Labs 의 부하 도구. JS 시나리오 + Prometheus
  output 내장 + Grafana 스택과 톤 일치.
- **Q-LOAD-2 (b) 로컬 + cgroup 격리 잠금** — 단일 호스트 + Docker `cpus` /
  `mem_limit` / `cpuset` 한정값으로 측정 컨테이너의 자원을 격리.

위 두 결정은 본 문서의 §2 (k6 선택) + §4 (cgroup 격리) 가 단일 출처로 잠근다. 본
PRD `00-overview` §2 G4.2 정합.

---

## 2. k6 선택 — Q-LOAD-1 (a) 잠금

### 2.1 결정 요약

| Q-ID | 결정 | 잠금일 |
|------|------|--------|
| Q-LOAD-1 | (a) k6 (Grafana Labs, JS 시나리오) | 2026-05-27 |

### 2.2 선택 사유

- **Grafana 스택 톤 일치** — 본 저장소는 이미 `docker-compose.yml` 에 Prometheus +
  Grafana 컨테이너를 운영(3단계 PRD `prd-phase3/03` 잠금). k6 는 Grafana Labs 의
  공식 도구이므로 운영 톤이 일치한다.
- **Prometheus output 내장** — k6 ≥ v0.42 의 `--out experimental-prometheus-rw` /
  `output-prometheus-remote` 가 측정 결과를 Prometheus remote write 로 전송 가능.
  본 PRD 의 측정 결과가 동일 Prometheus 인스턴스에 누적되므로 3단계 메트릭과 같은
  대시보드에서 비교 가능.
- **시나리오 표현력** — k6 의 `executor` (constant-arrival-rate / ramping-arrival-rate
  / ramping-vus) 가 본 PRD `01` §2.3 등록 패턴 enum (steady / burst / spike) 을
  자연스럽게 표현.
- **커뮤니티 자료 풍부** — Grafana Labs 의 공식 문서 + 커뮤니티 시나리오 예시가
  본 PRD 의 학습 비용을 최소화.

### 2.3 탈락 옵션의 사유

| 옵션 | 탈락 사유 |
|------|-----------|
| (b) Artillery (Node.js, YAML / JS) | 시나리오 표현력이 k6 대비 약함. spike / ramping 패턴의 정밀 제어가 제한적. Prometheus output 은 플러그인 의존 |
| (c) Vegeta (Go CLI) | Go 도구. 본 저장소 스택과 분리. CLI 인자 기반이라 복잡 시나리오(혼합 페이로드 분포, IT-S 변형) 표현이 부자연 |
| (d) 직접 구현 (Node.js + Vitest 활용) | 측정 도구 자체의 신뢰성 책임이 본 PRD 의 책임이 됨 — 부담 과대. 측정 도구의 RPS 정확도 / 분산 / 통계 추출은 별도 검증 필요 |

### 2.4 새 의존성 도입의 정당성 (CLAUDE.md §2 정합)

CLAUDE.md §2 가 "새 의존성 추가 전 정당성 명시" 를 요구한다. k6 는 다음과 같이 §2
표 안에 포함된다고 본 PRD 가 판단한다.

- **k6 = Docker 이미지 (`grafana/k6:latest`)** 추가이지 npm 의존성이 아님. CLAUDE.md
  §2 표의 "컨테이너 = Docker Compose" 항목 안에서 새 서비스 추가는 정합.
- 본 저장소의 `package.json` / `pnpm-lock.yaml` 에 새 npm 의존성을 추가하지 않는다.
- k6 시나리오 파일(JS) 은 `packages/` 외부(예: `docker/k6/scenarios/`) 에 두어
  TypeScript 빌드 / 테스트 파이프라인과 분리. PLAN 단계가 위치 잠금.

위 두 사유로 본 PRD 는 CLAUDE.md §2 의 "새 npm 의존성 도입" 제한을 위반하지 않는다.

---

## 3. docker-compose 의 k6 서비스 추가 (잠정 형태)

본 §3 은 PLAN 단계가 `docker-compose.yml` 에 추가할 k6 서비스의 **잠정 YAML 형태**
다. 정확한 YAML 은 PLAN 단계가 작성한다. 본 PRD 는 형태와 의존성만 잠근다.

### 3.1 잠정 YAML 형태

```yaml
# PLAN 단계가 docker-compose.yml 에 추가할 k6 서비스의 잠정 형태.
# 본 PRD 는 형태만 잠근다. 정확한 옵션 / 환경변수 / 볼륨 마운트는 PLAN 단계.

  k6:
    image: grafana/k6:latest
    container_name: webhook-relay-k6
    depends_on:
      api:
        condition: service_healthy   # api 가 헬스체크 통과 후 부하 인가
      worker:
        # worker 가 첫 인스턴스 기동 후. --scale worker=N 시 N-1 인스턴스는 이미
        # 같은 docker network 에 합류한 상태에서 k6 가 시작.
        condition: service_started
    volumes:
      - ./docker/k6/scenarios:/scenarios:ro          # LP-1~LP-4 시나리오 파일
      - ./docker/k6/results:/results                  # 결과 출력 (Q-LOAD-12 결정 위임)
    environment:
      # k6 시나리오에서 참조할 타겟 URL.
      K6_TARGET_URL: http://api:3000/webhooks
      K6_API_BEARER_TOKEN: ${API_BEARER_TOKEN}
      # Prometheus remote write — 측정 결과가 동일 Prometheus 에 누적.
      K6_PROMETHEUS_RW_SERVER_URL: http://prometheus:9090/api/v1/write
      # cgroup 격리 한정값 (§4) 은 deploy.resources.limits 로 표현.
    deploy:
      resources:
        limits:
          # §4.2 표의 잠정 한정값. PLAN 단계가 측정 호스트 사양에 맞춰 잠금.
          cpus: "2.0"
          memory: 1G
    # 기본 비실행 — measure 프로파일 시에만 기동.
    profiles: ["measure"]
```

### 3.2 docker-compose 의 기존 5 서비스와의 관계

본 저장소의 현재 `docker-compose.yml` 은 redis / api / worker / prometheus / grafana
의 5 서비스를 운영한다(3단계 PRD `prd-phase3/03` 잠금 + 본 PRD `00-overview` §0
참조). k6 는 **6번째 서비스** 로 추가되며, `profiles: ["measure"]` 가 기본 비실행을
보장한다.

- 일반 `docker compose up` 은 5 서비스만 기동(기존 운영 톤 유지).
- 측정 시 `docker compose --profile measure up k6` 로 k6 만 추가 기동.
- 측정 결과 보존(`/results` 볼륨) 의 정확한 형식은 Q-LOAD-12 결정 위임 — §6.

### 3.3 k6 의 docker network 합류

- k6 컨테이너는 docker-compose 의 기본 network 에 합류해 `api:3000` 을 직접
  접근한다(호스트 포트 매핑 우회). 호스트 NAT 오버헤드 제거 + 측정 정확도 보호.
- `--scale worker=N` 시 worker 인스턴스는 같은 network 에 합류하며, k6 는 worker 에
  직접 접근하지 않는다(부하는 `api/webhooks` 에만 인가). worker 의 작업 처리는
  Redis 큐를 통해 비동기로 일어난다.

---

## 4. cgroup 격리 — Q-LOAD-2 (b) 잠금

### 4.1 결정 요약

| Q-ID | 결정 | 잠금일 |
|------|------|--------|
| Q-LOAD-2 | (b) 로컬 + cgroup 격리 (Docker `cpus` / `mem_limit` / `cpuset`) | 2026-05-27 |

### 4.2 한정값 표 (잠정)

본 §4.2 는 본 PRD 가 잠그는 cgroup 한정값의 **잠정 형태** 다. 정확한 숫자는 PLAN
단계가 측정 호스트 사양에 맞춰 잠금. 잠정 형태는 다음 표가 단일 출처.

| 서비스 | `cpus` (한정) | `mem_limit` (한정) | `cpuset` (선택) | 비고 |
|--------|---------------|---------------------|------------------|------|
| `redis` | 1.0 | 512M | (호스트 의존) | 단일 인스턴스. knee point 식별의 측정 대상(`04` §5) |
| `api` | 1.0 | 512M | (호스트 의존) | `SERVICE_MODE=api`. Fastify + producer |
| `worker` | 1.0 / 인스턴스 | 512M / 인스턴스 | (호스트 의존) | `SERVICE_MODE=worker` × N. `--scale worker=N` 시 각 인스턴스에 동일 한정 |
| `prometheus` | 0.5 | 256M | (호스트 의존) | scrape + rule evaluation |
| `grafana` | 0.5 | 256M | (호스트 의존) | 측정 중 비활성 가능 |
| `k6` | 2.0 | 1G | (호스트 의존) | 부하 인가 측. CPU 여유 확보로 부하 인가 정확도 보호 |

**총합 (1 worker 기준):** `cpus` = 6.0 / `mem_limit` = 약 3GB. 단일 호스트의 사양이
충분해야 측정 자체의 노이즈를 피한다.

**워커 수 N = 5 / 10 의 경우:** `cpus` 총합이 호스트 코어 수를 초과하면 cgroup
격리 의미가 약해진다. 본 PRD 의 측정 매트릭스(`04` §3 N ∈ {1, 2, 5, 10}) 가 호스트
사양 한계와 충돌하면 PLAN 단계가 측정 호스트 사양 조정 또는 매트릭스 축소를
결정한다.

### 4.3 측정 호스트 호환성 메모

- **Docker Desktop (macOS / Windows)** — `cpus` / `mem_limit` 는 Docker Desktop 의
  VM 한계 안에서 동작. macOS Apple Silicon (M1/M2/M3) 은 ARM64 이미지 우선 사용 필요
  — `grafana/k6` 는 multi-arch 이미지 제공.
- **Linux (native Docker)** — `cgroup v2` (RHEL 9 / Ubuntu 22.04 이상) 환경에서
  `cpus` / `mem_limit` 가 직접 적용. `cpuset` 는 NUMA 최적화용 (선택).
- **CI runner** — Q-LOAD-2 (b) 결정이 "로컬" 을 잠금했으므로 CI 환경 측정은 본
  PRD 범위 밖. 회귀 가드 IT-LOAD-N (Q-LOAD-13) 도입 시 CI 사용 결정은 §8 가 다룬다.

---

## 5. 측정 호스트 메타데이터 형식

본 §5 는 결과 보고서 행마다 **필수로 기록되어야 하는** 메타데이터 형식의 단일
출처다. 본 PRD `00-overview` §7 용어집의 "측정 메타데이터" 정의 정합.

### 5.1 필수 항목

| 항목 | 형식 | 예시 |
|------|------|------|
| 측정 호스트 CPU 모델 | 문자열 | `Apple M2 Pro (10-core)` |
| 측정 호스트 CPU 주파수 | GHz | `3.5` |
| 측정 호스트 RAM | GB | `32` |
| 측정 호스트 OS | 문자열 | `macOS 14.5 (Darwin 24.6.0)` |
| Docker 버전 | 문자열 | `Docker Desktop 4.30 (Engine 26.1.4)` |
| k6 버전 | 문자열 | `v0.50.0` |
| git commit SHA | 40자 hex | `a0a3b25e2c...` |
| 측정 일시 (시작) | ISO 8601 UTC | `2026-06-01T03:15:00Z` |
| 측정 일시 (종료) | ISO 8601 UTC | `2026-06-01T03:46:32Z` |
| LP-ID | `01` §3.1 의 ID | `LP-2` |
| 워커 수 N | 정수 | `5` |
| Redis 토폴로지 | 문자열 | `single-instance (cgroup cpus=1.0, mem=512M)` |
| cgroup 한정값 (전체) | YAML/JSON inline | `{api: {cpus: 1.0, mem: 512M}, worker: {cpus: 1.0, mem: 512M}, ...}` |
| 부하 패턴 (T) | `01` §2.3 enum | `steady` |
| 페이로드 분포 (P) | 비율 표현 | `small:80,medium:15,large:5` |

### 5.2 메타데이터 표현 형식 예시 (YAML)

```yaml
# 결과 보고서 1행의 메타데이터 헤더.
measurement:
  id: 2026-06-01T03-15-00Z_LP-2_N5
  started_at: 2026-06-01T03:15:00Z
  ended_at:   2026-06-01T03:46:32Z
  git_commit: a0a3b25e2c3d4f5a6b7c8d9e0f1a2b3c4d5e6f70
  host:
    cpu_model: "Apple M2 Pro (10-core)"
    cpu_ghz: 3.5
    ram_gb: 32
    os: "macOS 14.5 (Darwin 24.6.0)"
  docker_version: "Desktop 4.30 (Engine 26.1.4)"
  k6_version: "v0.50.0"
  cgroup:
    api:        { cpus: 1.0, mem: 512M }
    worker:     { cpus: 1.0, mem: 512M, instances: 5 }
    redis:      { cpus: 1.0, mem: 512M }
    prometheus: { cpus: 0.5, mem: 256M }
    grafana:    { cpus: 0.5, mem: 256M }
    k6:         { cpus: 2.0, mem: 1G }
  redis_topology: "single-instance"
  load_profile:
    lp_id: LP-2
    rps: 100
    payload_distribution: { small: 0.80, medium: 0.15, large: 0.05 }
    pattern: steady
    window:
      warmup_s: 60
      load_s:   1800
      cooldown_s: 60
results:
  # ... §6 결정 위임 (Q-LOAD-12) 에 따라 형식 잠금
```

### 5.3 메타데이터 누락의 결과 무효화

- 위 §5.1 항목 중 하나라도 결과 보고서에 누락되면 그 측정 결과는 **무효** 로
  간주한다. PLAN 단계의 측정 자동화가 자동 수집을 강제해야 한다.
- 특히 `git_commit` 누락은 재현성을 결정적으로 약화시킨다 — 같은 commit 으로
  재측정 가능해야 측정 분산 허용 오차(§7.2) 가 의미 있다.

---

## 6. 결과 보존 형식 — Q-LOAD-12 결정 위임

본 §6 은 측정 결과 보고서의 보존 형식에 대한 옵션 정리 + 결정 위임이다.

### 6.1 옵션

| 옵션 | 위치 | 형식 | 가독성 | 자동화 |
|------|------|------|--------|---------|
| (a) Markdown 표 | `docs/prd-phase4/results/<LP-ID>_<date>.md` | 사람 가독 표 + YAML 헤더 | 높음 | 수동 또는 스크립트 |
| (b) CSV | `docs/prd-phase4/results/<LP-ID>_<date>.csv` | tabular | 중간 (Excel) | 자동 추출 용이 |
| (c) Grafana 대시보드 자동 생성 | Grafana 인스턴스 | JSON dashboard | 매우 높음 | 복잡 |
| (d) Markdown + JSON 이중 | `docs/prd-phase4/results/<LP-ID>_<date>.{md,json}` | 사람 가독 + 기계 가독 | 양쪽 | 중간 |

### 6.2 트레이드오프

- **(a) Markdown 표** — PR 리뷰 시 diff 가독성 우수. 본 PRD 묶음의 톤 일치
  (3단계 / 1~2단계 모두 Markdown). 결과 자동 추출(예: SLO 재조정 PR) 시 정규식
  파싱 부담.
- **(b) CSV** — 수치 데이터 추출 용이. Excel / Pandas / Grafana CSV datasource
  연동 가능. 메타데이터(§5) 가 분리되어 추적성 약함.
- **(c) Grafana 대시보드 자동 생성** — 시각화 우수. 본 PRD `02` 의 k6 Prometheus
  output 과 자연스러운 연계. 단점: 대시보드 JSON 의 코드 버전 관리 부담 + 측정 시점
  스냅샷 보존이 별도 작업.
- **(d) Markdown + JSON 이중** — 사람 가독 + 기계 가독 양립. 단점: 두 형식 동기화
  필요 (Markdown 의 표와 JSON 의 같은 숫자가 일치해야 함).

### 6.3 잠정 권고

**(a) Markdown 표.** 본 저장소의 톤 일치 + PR 리뷰 가독성 + 단일 호스트 데모 환경의
규모(측정 횟수 ≤ 수십 회) 가 (a) 에 부합. SLO 재조정 PR 의 자동 추출은 후속 PLAN
또는 수동 처리.

**결정자:** 사람. PLAN 진입 전 잠금.

### 6.4 결과 보존 위치 (잠정)

- `docs/prd-phase4/results/` 디렉터리 신규 생성. `.gitignore` 대상 아님 — 결과는
  PR 로 commit 되어 추적된다.
- 본 PRD `00-overview` §2 G4.8 가 명시: "결과를 단일 보고서 형식 (`docs/prd-phase4/results/`
  또는 README 갱신, 위치는 `02` §6 가 잠금) 으로 보존한다."

---

## 7. 재현성 / 격리 정책

### 7.1 재현성의 정의

같은 LP-ID + 같은 cgroup 한정값 + 같은 git commit + 같은 측정 호스트 사양에서
재측정 시, 결과의 핵심 SLI (처리량 / p50 / p99 / 카디널리티 / DLQ 적재율) 가 **±5%
오차 안** 에 들어와야 한다. 들어오지 않으면 측정 도구의 신뢰성 또는 환경 격리에
문제가 있다.

### 7.2 측정 분산 허용 오차

| SLI | 허용 분산 |
|-----|------------|
| 처리량 (RPS achieved) | ±2% (k6 가 정확히 인가) |
| p99 처리 지연 (W2) | ±5% |
| p99 등록 지연 (D2) | ±5% |
| 메트릭 카디널리티 (IT-OBS-11) | 변동 없음 (구조적 수치) |
| DLQ 적재율 (SLO-4) | ±10% (낮은 절대값으로 상대 분산 큼) |

**±5% 초과 시:**
- 측정 호스트의 노이즈 의심 (백그라운드 프로세스 / 시스템 업데이트 / 외부 부하).
- cgroup 한정값이 호스트 사양 대비 너무 크거나 작음 (over-commit / under-allocate).
- k6 자체의 RPS 분산이 큼 (스크립트 검토 필요).

### 7.3 격리 정책

- **측정 호스트는 다른 부하가 없는 상태에서 측정** — Chrome / Slack / IDE 등
  백그라운드 닫기 권장. 본 PRD 가 강제하지는 않지만 결과 신뢰성에 직접 영향.
- **단일 측정 = 단일 LP-ID + 단일 N** — 한 docker compose 인스턴스에서 LP-1 →
  LP-2 → ... 순차 측정은 허용. 단, 각 측정 사이 redis flush 또는 큐 상태 초기화
  필요(누적 큐 영향 방지). PLAN 단계가 절차 잠금.
- **Prometheus 데이터 보존** — 기본 보존 기간(2주) 안에서는 같은 Prometheus 인스턴스가
  여러 측정의 결과를 누적. 측정별 time range 로 PromQL 쿼리 분리.

---

## 8. 회귀 가드 IT-LOAD-N — Q-LOAD-13 결정 위임

본 §8 은 본 PRD 의 부하 측정 결과 중 일부를 통합 테스트(IT-LOAD-N) 로 잠금하는 방안의
옵션 정리 + 결정 위임이다.

### 8.1 옵션

| 옵션 | CI 시간 부담 | 회귀 감지 |
|------|---------------|------------|
| (a) IT-LOAD-N 없음 | 0 (현 상태 유지) | 부하 회귀 감지 불가 — 운영 측정만 |
| (b) LP-1 (baseline) 만 CI | 약 7분 (W_warmup + W_load_short + W_cooldown) | baseline 영역의 회귀 감지 가능 |
| (c) LP-1 + LP-2 (nominal) CI | 약 35분 | nominal 영역까지 회귀 감지 |
| (d) 전건 (LP-1~LP-4) CI | 약 60분+ | 전 영역 회귀 감지. CI 시간 부담 큼 |

### 8.2 트레이드오프

- **(a) IT-LOAD-N 없음** — 가장 단순. 부하 회귀가 운영 측정 또는 사람 검토에 의존.
  본 PRD 의 측정 자체가 1~3단계 IT-S / IT-OBS 보다 비결정성이 크므로 CI 통합이
  flaky 위험.
- **(b) baseline 만 CI** — baseline 영역(LP-1) 은 단일 실행 IT-S1 의 부하 확장이라
  결정성이 높음. 약 7분 = CI 의 일반 통합 테스트 (`pnpm test:integration`) 시간의
  약 1배 추가.
- **(c) baseline + nominal CI** — nominal 영역(LP-2) 의 SLO 잠정값 검증을 CI 가
  잠금. 단점: 약 35분 CI 시간 — 본 저장소의 단독 개발 패턴에서는 부담.
- **(d) 전건 CI** — 가장 강력한 회귀 감지. 단, 약 60분+ 의 CI 시간은 본 저장소의
  운영 톤과 분리되며 GitHub Actions free tier 한도 초과 위험.

### 8.3 잠정 권고

**(a) IT-LOAD-N 없음.** 본 PRD 의 단독 개발 + 데모 패턴이 (a) 에 부합. 본 PRD 의
측정은 사람 검토 + 결과 보고서 commit 으로 추적성 확보. (b) 또는 (c) 도입은 본 PRD
범위 밖의 별도 결정.

**결정자:** 사람. PLAN 진입 전 잠금.

### 8.4 IT-LOAD-N 도입 시의 분류 / 명명 규칙 (Q-LOAD-13 (b) / (c) / (d) 채택 시)

- 테스트 ID: `IT-LOAD-<LP-ID>` (예: `IT-LOAD-LP-1`, `IT-LOAD-LP-2`).
- 파일 명명: `*.load.test.ts` (1~2단계 `*.integration.test.ts` 와 분리).
- 실행 명령: `pnpm test:load` (CI 가 선택적으로 실행).
- 통과 조건: 본 PRD `03` 의 SLO 재조정된 임계값을 기준으로 단언.

위 형식은 Q-LOAD-13 결정 후 확정. (a) 채택 시 본 §8.4 는 미사용.

---

## 9. 수용 기준 (AC)

본 §9 는 본 PRD `00-overview` §5 AC4.3 의 글자 단위 정합 절이다.

- **AC4.3 (재인용)** 측정 환경 잠금. 측정 호스트 사양 메타데이터 형식 + cgroup
  한정값 + Docker network 구성 + k6 + Prometheus + Grafana 설정의 단일 출처가
  본 PRD 안에 명시.
- **AC4.3.1 (본 문서 내부 AC)** §2 가 k6 선택 + 탈락 옵션 사유를 명시. §3 이
  docker-compose 의 k6 서비스 잠정 YAML 을 명시. §4 가 cgroup 한정값 표를 잠정값
  으로 명시. §5 가 측정 메타데이터 형식을 잠금.
- **AC4.3.2** §6 (Q-LOAD-12) + §8 (Q-LOAD-13) 의 옵션 + 트레이드오프 + 잠정 권고가
  명시. 결정자 = 사람 line 이 항목마다 명시.

본 §9 AC 가 충족되어야 본 PRD `00-overview` §5 의 PRD closeout 조건이 닫힌다.

---

## 10. 불변식 (Invariants)

- **I4.7 (k6 외 측정 도구 금지)** Q-LOAD-1 (a) 결정 정합. 본 PRD 가 측정에 사용하는
  도구는 k6 단일. 다른 도구(Artillery / Vegeta / 직접 구현) 추가는 본 PRD 본문 갱신
  PR 을 요구한다.
- **I4.8 (cgroup 격리 강제)** Q-LOAD-2 (b) 결정 정합. 모든 측정은 §4.2 한정값 표가
  적용된 docker-compose 환경에서 실행. cgroup 한정 없음(`cpus` 미지정) 측정은
  결과 보고서에서 **무효** 처리.
- **I4.9 (메트릭 메타데이터 완전성)** §5.1 항목 전건이 결과 보고서에 기록. 누락 시
  결과 무효(§5.3). PLAN 단계의 측정 자동화가 강제.
- **I4.10 (결과 위치 단일성)** §6.4 정합. 측정 결과는 `docs/prd-phase4/results/`
  단일 디렉터리. README / 다른 디렉터리 산재 금지.
- **I4.11 (k6 의 docker network 합류)** §3.3 정합. k6 컨테이너는 호스트 NAT 우회
  하고 docker 내부 network 에서 `api:3000` 직접 접근. 호스트 포트 매핑 측정은 본 PRD
  의 측정 환경 외.
- **I4.12 (재현성 ±5% 허용 오차)** §7.2 정합. 핵심 SLI 의 측정 분산이 ±5% 초과
  하면 측정 도구 / 환경의 노이즈로 진단. SLO 재조정 규칙(`03` §4) 에 영향.

---

## 11. 리스크 / 오픈 퀘스천

본 PRD `00-decisions-needed.md` §🟡 의 Q-LOAD-12 / Q-LOAD-13 이 본 문서 §6 / §8 의
옵션 정리 + 결정 위임으로 잠금 대기 중. 그 외 본 문서 단위 리스크:

- **R4.6** k6 의 RPS 정확도 — `executor: constant-arrival-rate` 가 목표 RPS 를
  정확히 인가하는지 측정 환경에서 검증 필요. §7.2 (재현성 ±5%) 가 가드.
- **R4.7** cgroup 한정값과 측정 호스트 사양의 매칭 — §4.2 잠정값이 실제 측정 호스트
  에서 over-commit / under-allocate 되지 않는지 PLAN 단계가 검증.
- **R4.8** Prometheus remote write 의 k6 metric 누적 — k6 자체 메트릭(`k6_http_*`)이
  Prometheus 에 누적되며 카디널리티 증가. 3단계 IT-OBS-11 (카디널리티 ≤ 1000) 의
  단언 대상에서 k6 메트릭은 제외해야 함 (별도 job label 분리). PLAN 단계 검증.
- **R4.9** Docker Desktop (macOS / Windows) 의 cgroup 격리 의미 — Docker Desktop 은
  VM 안에서 cgroup 을 적용하므로 native Linux 와 격리 수준이 다를 수 있음. §4.3
  메모.

---

## 12. PRD 변경 제안

본 문서 작성 중 1~3단계 PRD / architecture / README 에 보강 권장 항목은
[`05-out-of-scope-and-open-questions.md`](./05-out-of-scope-and-open-questions.md)
§4 통합 표가 단일 출처. 본 §은 그 표를 가리키는 포인터다.

본 문서 단위 발견 항목:

- **C-LOAD-3:** `docker-compose.yml` 에 `k6` 서비스 추가 — Q-LOAD-12 / Q-LOAD-13
  결정 후 PLAN 단계가 정확한 YAML 작성. CLAUDE.md §2 표의 "컨테이너 = Docker
  Compose" 안에서 정합.
- **C-LOAD-4:** `docs/architecture.md` §2 컴포넌트 표 — "k6 (측정 도구)" 행 추가 제안.
  본 PRD 승인 + PLAN 완료 후. 결정자: 사람.
- **C-LOAD-5:** `.env.example` — `K6_TARGET_URL` / `K6_API_BEARER_TOKEN` /
  `K6_PROMETHEUS_RW_SERVER_URL` 항목 추가 — Q-LOAD-12 결정 후 PLAN 단계.
