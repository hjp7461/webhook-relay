# 02. M-LOAD-1 — Bootstrap (k6 서비스 + `docker/k6/` 골격 + cgroup + 메타데이터 헬퍼)

> **PLAN 진입 조건:** 본 PLAN 묶음(`docs/plan-phase4/`) outline 3 파일(`README` +
> `00-decisions-needed` + `01-milestones`) 이 승인되고, PRD Q-LOAD-1~13 이 모두
> Resolved (2026-05-27 일괄 잠금). 1~3단계 IT(IT-S1~S7 + IT-S1b/S2b/S6b + IT-R1 +
> IT-OBS-1~12) + UT-1~6 + 보강(metrics-c-catalog / metrics-d-w-catalog) 전건 그린.
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 측정 인프라(k6 컨테이너 + 시나리오 자리 +
> 결과 자리 + 메타데이터 헬퍼 명세) 만 잠금. **측정 자체는 M-LOAD-2 책임이며 본
> 마일스톤에서 어떤 LP-N 도 실행하지 않는다** (원칙 3 범위 통제). 자율 일탈 사전
> 승인 규칙(`README.md` "구현 착수 조건" + outline §5) 정합 — `docker/k6/` 의 실제
> 디렉터리/파일 생성은 본 PLAN 문서의 명세 위에서 후속 commit 시리즈가 수행한다.
>
> **본 마일스톤이 명시적으로 다루지 않는 것:** LP-1~LP-4 시나리오 작성(M-LOAD-2~4
> 책임), 실제 측정 실행(M-LOAD-2~5 책임), 결과 보고서 작성(M-LOAD-2~6 책임), SLO
> 임계 갱신 PR(M-LOAD-6 책임).

---

## 1. 진입 조건

- 본 PLAN 묶음(`docs/plan-phase4/`) outline 3 파일이 사용자 승인 — 본 마일스톤
  PLAN 부터 순차 commit 진입.
- PRD Q-LOAD-1~13 모두 Resolved (`prd-phase4/00-decisions-needed.md` §🔴 5건 +
  §🟡 8건, 2026-05-27 잠금 완료).
- 본 PLAN 의 cross-link 잠금:
  - Q-LOAD-1 (a) k6 → 본 마일스톤 §4 단계 1~3 (docker-compose `k6` 서비스 추가).
  - Q-LOAD-2 (b) 로컬 + cgroup 격리 → 본 마일스톤 §4 단계 1 (cgroup 한정값 명세) +
    §4 단계 6 (호스트 사양 호환성 메모).
  - Q-LOAD-12 (a) Markdown 표 → 본 마일스톤 §4 단계 5 (`docs/prd-phase4/results/`
    디렉터리 + README 형식 명세).
  - Q-LOAD-13 (a) IT-LOAD-N 없음 → 본 마일스톤이 회귀 가드를 추가하지 않음 (§3
    참조).

## 2. 선행 의존

- **마일스톤:** 1~3단계 PLAN 전건 완료 (현재 `main` 기준 `ba4c613`).
- **PRD 결정 잠금:** Q-LOAD-1, Q-LOAD-2, Q-LOAD-12, Q-LOAD-13 (§1 cross-link).
- **1~3단계 결정 정합:** 본 마일스톤은 기존 5 서비스(redis / api / worker /
  prometheus / grafana) 의 컴포즈 정의를 변경하지 않는다 — `profiles: ["measure"]`
  로 분리된 6번째 서비스(`k6`) 만 추가. 3단계 I3.1 / I3.2 / I6.1 / I6.2 정합 유지.
- **자율 일탈 사전 승인 규칙:** 본 마일스톤은 `docker/k6/` 디렉터리를 **실제로
  만들지 않는다** — 명세만 잠근다. 디렉터리 자리 잠금은 후속 commit 시리즈가 수행
  (브리프 §1.3).

## 3. 측정 우선 시퀀스 (Bootstrap 한정 — 회귀 가드 신규 도입 0건)

본 마일스톤은 측정 실행 마일스톤(M-LOAD-2~6) 의 기반 인프라만 잠금한다. 본 마일
스톤에서 새로 도입하는 회귀 가드는 0건이며(Q-LOAD-13 (a) 정합), 다음 두 가지를
"빨강 → 통과" 패턴으로 확인한다.

1. **(빨강 → 통과) `docker compose config` 의 k6 서비스 등장:**
   - 본 마일스톤 §4 단계 1 이전: `docker compose config` 출력에 `services.k6` 0건.
   - 본 마일스톤 §4 단계 1 이후: `docker compose config` 출력에 `services.k6` 등장
     + `profiles: ["measure"]` 명시 + `deploy.resources.limits.cpus` / `memory`
     명시.
   - 본 출력은 별도 회귀 가드 IT 가 아니며, 사용자가 본 마일스톤 종료 시점에 수동
     실행으로 확인 (§6 Done 정의).

2. **(빨강 → 통과 — 단, 빨강 단계 없음) 1~3단계 회귀 가드 전건 그린:**
   - 본 마일스톤은 `packages/` 코드를 변경하지 않는다. 따라서 IT-S1~S7 / IT-S1b /
     IT-S2b / IT-S6b / IT-R1 / IT-OBS-1~12 / UT-1~6 / metrics-c-catalog /
     metrics-d-w-catalog 전건이 본 마일스톤 시작 시점에 이미 그린이며, 종료 시점
     에도 그린 유지를 회귀 보호 가드로 본다.

> 본 마일스톤은 "측정 실행 → 결과 보고서 commit" 사이클을 가지지 않는다. 측정
> 사이클은 M-LOAD-2 부터 시작 (`03-m-load-2-lp1-baseline.md` §3).

## 4. 구현 단계 (커밋 단위)

각 번호는 1 commit. Conventional Commits 접두어를 붙인다. 본 마일스톤의 총 commit
수는 7건 (필요 시 8건).

### 단계 1 — `feat(docker-compose): add k6 service (profile=measure)`

- `docker-compose.yml` 에 6번째 서비스 `k6` 추가 (PRD `02` §3.1 잠정 YAML 정합).
  잠정 YAML 형태 (정확한 값은 본 단계 commit 이 잠금):

  ```yaml
  k6:
    image: grafana/k6:latest
    container_name: webhook-relay-k6
    depends_on:
      api:
        condition: service_healthy
      worker:
        condition: service_started
    volumes:
      - ./docker/k6/scenarios:/scenarios:ro
      - ./docker/k6/results:/results
    environment:
      K6_TARGET_URL: http://api:3000/webhooks
      K6_API_BEARER_TOKEN: ${API_BEARER_TOKEN}
      K6_PROMETHEUS_RW_SERVER_URL: http://prometheus:9090/api/v1/write
    deploy:
      resources:
        limits:
          cpus: "2.0"
          memory: 1G
    profiles: ["measure"]
  ```

- **회귀 가드:** `profiles: ["measure"]` 가 일반 `docker compose up` 에서 본 서비
  스를 비실행으로 분리한다(PRD `02` §3.2 정합).
- **금지:** 기존 5 서비스(redis / api / worker / prometheus / grafana) 의 컴포즈
  정의를 변경하지 않는다. `depends_on` 추가 0건, 환경변수 변경 0건, 포트 변경 0건.
- **커밋 메시지에 명시:** PRD `02` §2.4 의 새 의존성 정당성(`grafana/k6` Docker
  이미지 1건, npm 의존성 0건 — CLAUDE.md §2 "컨테이너 = Docker Compose" 안 정합).
- **잠금 위반 시 멈춤:** `docker compose config` 가 invalid 면 즉시 보고. 임의
  수정 금지.

### 단계 2 — `feat(prometheus): enable remote write receiver for k6 metrics`

- `docker/prometheus.yml` 의 `--web.enable-remote-write-receiver` 활성화 명세.
  본 단계는 **YAML 자체 변경 없이** Prometheus 컨테이너의 command 플래그 추가로
  처리 (`docker-compose.yml` 의 `prometheus.command` 절 1건 추가).
- 잠정 YAML 형태:

  ```yaml
  prometheus:
    image: prom/prometheus:latest
    # ... 기존 설정 ...
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --web.enable-remote-write-receiver
  ```

- **회귀 가드:** 기존 3단계 IT-OBS-7 의 provisioning YAML 단언이 그대로 그린.
  Prometheus 의 scrape_configs 는 변경 없음.
- **금지:** `docker/prometheus.yml` 본문 변경 0건. command 플래그만 추가.
- **잠금 위반 시 멈춤:** 만약 `--web.enable-remote-write-receiver` 가 본 저장소의
  Prometheus latest 이미지에서 미지원이면 즉시 보고 + 이미지 버전 잠금 결정 위임.

### 단계 3 — `feat(docker/k6): scenarios + results directory placeholder`

- `docker/k6/scenarios/.gitkeep` + `docker/k6/results/.gitkeep` 신규 생성.
- 본 단계는 디렉터리 자리만 잠근다. LP-1~LP-4 시나리오 파일은 M-LOAD-2~4 책임.
- **회귀 가드:** `docker compose config` 가 `./docker/k6/scenarios` / `./docker/k6/results`
  마운트를 정상 해석.
- **커밋 메시지에 명시:** "디렉터리 자리만 잠금. 실제 시나리오 파일은 M-LOAD-2~4
  에서 채움."
- **금지:** `.gitkeep` 외의 파일을 본 디렉터리에 생성하지 않는다. 본 PLAN 의 어떤
  마일스톤도 `docker/k6/scenarios/` 의 시나리오 파일을 사용자 승인 없이 추가하면
  자율 일탈.

### 단계 4 — `feat(docker/k6/scripts): add measurement host metadata collector`

- `docker/k6/scripts/collect-metadata.sh` 신규 생성. 출력 형식은 PRD `02` §5.2 의
  YAML 형식 정합. 수집 항목 (PRD `02` §5.1 의 필수 8 항목):
  - 측정 호스트 CPU 모델 (예: `sysctl -n machdep.cpu.brand_string` on macOS,
    `lscpu` on Linux).
  - 측정 호스트 CPU 주파수 (GHz).
  - 측정 호스트 RAM (GB).
  - 측정 호스트 OS (예: `sw_vers -productVersion` + `uname -r`).
  - Docker 버전 (`docker version --format`).
  - k6 버전 (`docker compose run --rm k6 version`).
  - git commit SHA (`git rev-parse HEAD`).
  - 측정 일시(ISO 8601 UTC) 시작 / 종료 — 본 헬퍼는 시작 시점만 출력. 종료 시점
    은 측정 실행 스크립트가 별도 갱신.

- 호스트명(추가 식별성) 도 함께 출력 — PRD `02` §5.1 표가 명시한 8 항목 외에
  추가로 자유 항목이며 결과 보고서의 추적성 강화.

- 출력 위치: `docker/k6/results/<measurement-id>/metadata.yaml` (PLAN 명세 기준).
  실제 파일 생성은 측정 사이클 안에서 M-LOAD-2 가 수행.

- **회귀 가드:** 본 스크립트는 호스트 측에서 수동 실행되며 컨테이너 안에서 실행
  되지 않는다. `docker compose config` 와 무관.

- **금지:** 본 스크립트 안에서 `pnpm` / `node` 호출 0건. POSIX shell + 표준 유틸
  리티(`uname`, `sysctl`, `lscpu`, `git`, `docker`) 만 사용.

### 단계 5 — `feat(docs/prd-phase4/results): add directory + README (Q-LOAD-12 정합)`

- `docs/prd-phase4/results/.gitkeep` + `docs/prd-phase4/results/README.md` 신규
  생성.
- `README.md` 의 내용 명세 (Markdown 표 형식, Q-LOAD-12 (a) 정합):
  - **§1 본 디렉터리의 단일 출처 안내** — PRD `02` §6.4 cross-link.
  - **§2 결과 보고서 명명 규칙:**
    - LP 측정: `<LP-ID>_<YYYY-MM-DD>.md` (예: `LP-1_2026-06-01.md`).
    - 수평 확장: `horizontal-scaling_<YYYY-MM-DD>.md`.
    - 최종 종합: `final_<YYYY-MM-DD>.md`.
  - **§3 보고서 본문 형식:**
    - YAML 메타데이터 헤더 (PRD `02` §5.2 형식 정합 — 8 항목 + cgroup 한정값 +
      LP-ID + 부하 패턴 + 페이로드 분포 + 측정 윈도우).
    - Markdown 표 본문 (행 = SLI 단위, 열 = p50 / p99 / 평균 / 분산).
    - "실패 사유" 절 (측정 무효 시 — PRD `03` §3.4 무효 조건 5건 중 어느 것이
      발동했는지).
  - **§4 commit 정책 cross-link** — `08-cross-cutting.md` §2.
- **금지:** 본 단계에서 실제 LP-N 결과 보고서 파일을 생성하지 않는다. README 가
  형식 잠금만 수행. LP-1 보고서는 M-LOAD-2 책임.

### 단계 6 — `docs(plan-phase4): document cgroup host compatibility check procedure`

- 본 단계는 **이미 본 PLAN 문서 안에 §5 cgroup 한정값 호환성 체크가 명세되어
  있으므로 별도 신규 파일 생성 없이 본 PLAN 단위의 commit 으로 처리**. 본 PLAN
  파일(`02-m-load-1-bootstrap.md`) 의 §5 절이 단일 출처.
- 호환성 체크 절차 (PRD `02` §4.2 메모 + §4.3 호환성 메모 정합):
  - 측정 호스트의 CPU 코어 수 ≥ N=1 기준 6.0 (전체 6 서비스 한정값 총합).
  - 측정 호스트의 RAM ≥ 3GB (전체 한정값 총합).
  - N=5 / N=10 측정 시 worker × N cgroup cpus 가 호스트 코어 수 - 1 이하인지
    확인 (PRD `04` §2.3 정합).
- **호스트 사양이 미달이면** M-LOAD-1 종료 전에 사용자에게 보고 + 결정 위임. 임의
  로 cgroup 한정값을 축소 / 매트릭스를 축소하지 않는다(자율 일탈 사전 승인 규칙).

### 단계 7 — `docs(.env.example): add k6 environment variable keys`

- `.env.example` 의 환경변수 키 목록에 다음 3건 추가 (PRD `05` §4 C-LOAD-5 정합):
  - `K6_TARGET_URL=http://api:3000/webhooks`
  - `K6_API_BEARER_TOKEN=` (값은 `API_BEARER_TOKEN` 의 복제 — 본 키는 k6 컨테이너
    내부 명명).
  - `K6_PROMETHEUS_RW_SERVER_URL=http://prometheus:9090/api/v1/write`
- **회귀 가드:** 기존 환경변수 키(API_BEARER_TOKEN / WEBHOOK_HMAC_SECRET /
  WORKER_METRICS_PORT 등) 의 값/순서 변경 0건. 키 3건 추가만.
- **금지:** `CLAUDE.md` / `README.md` / `architecture.md` 본문 변경 0건 — 본 변경
  은 PRD `05` §4 C-LOAD-5 cross-link 위에서 PLAN 안 적용. 다른 C-LOAD-* 항목은
  별도 commit 시리즈(M-LOAD-6 인계 또는 사용자 결정).

> **단계 7 이후 회귀 점검:** `pnpm typecheck` 0 errors, `pnpm test:unit` 그린,
> `pnpm test:integration` 그린, `docker compose config` 유효, `docker compose up`
> 후 1~3단계 데모(IT-S1 수동 실행 + Grafana 대시보드 4종) 정상 동작.

## 5. 생성/수정할 파일 목록 (절대경로)

### 생성

- `/Users/connor/biz/webhook-relay/docker/k6/scenarios/.gitkeep`
- `/Users/connor/biz/webhook-relay/docker/k6/results/.gitkeep`
- `/Users/connor/biz/webhook-relay/docker/k6/scripts/collect-metadata.sh`
- `/Users/connor/biz/webhook-relay/docs/prd-phase4/results/.gitkeep`
- `/Users/connor/biz/webhook-relay/docs/prd-phase4/results/README.md`

### 수정

- `/Users/connor/biz/webhook-relay/docker-compose.yml` (k6 서비스 1건 + prometheus
  command 플래그 1건 추가. 기존 5 서비스의 다른 절은 변경 없음.)
- `/Users/connor/biz/webhook-relay/.env.example` (k6 환경변수 키 3건 추가).

### 절대 만들지/수정하지 않는 것 (자율 일탈 사전 승인 규칙 + outline 잠금)

- `docker/k6/scenarios/LP-*.js` — LP 시나리오 파일은 M-LOAD-2~4 책임.
- `docker/k6/results/<측정ID>/...` — 실제 측정 결과는 M-LOAD-2~6 책임.
- `docs/prd-phase4/results/LP-*.md`, `horizontal-scaling_*.md`, `final_*.md` —
  실제 결과 보고서는 M-LOAD-2~6 책임.
- `packages/**` — 본 마일스톤은 코드 변경 0건.
- `docker/prometheus.yml`, `docker/prometheus/rules/*.yaml` — 본문 변경 0건. 단계
  2 의 `--web.enable-remote-write-receiver` 는 `docker-compose.yml` 의 command
  플래그로 처리.
- `docker/grafana/**` — 본문 변경 0건.
- `docs/plan-phase4/README.md`, `00-decisions-needed.md`, `01-milestones.md` —
  outline 3 파일 변경 0건 (브리프 §1.2).
- `docs/prd-phase4/00~05.md` — PRD 본문 변경 0건 (Q-LOAD-1~13 잠금 보존).
- `docs/plan/`, `docs/plan-phase3/`, `docs/prd/`, `docs/prd-phase3/`, `docs/adr/`,
  `docs/architecture.md`, `CLAUDE.md`, `README.md` — 본 PLAN 범위 밖.

## 5a. cgroup 호스트 호환성 체크 결과 (M-LOAD-1 종료 시점, 단계 6 commit)

본 §5a 는 §4 단계 6 의 호환성 체크 절차의 **실측 결과** 단일 출처다. 본
마일스톤이 진입한 측정 호스트의 사양 vs PRD `02-measurement-tools-and-environment.md`
§4.2 cgroup 한정값 표의 정합을 확인한다.

### 측정 호스트 사양 (2026-05-27 검토)

| 항목 | 값 |
|------|----|
| CPU 모델 | Intel Core i7-8750H @ 2.20GHz |
| CPU 코어 수 | 12 |
| RAM | 32 GB |
| OS | macOS 15.7.7 (Darwin 24.6.0) |
| Docker | 29.4.3 (Server + Client) |

### PRD `02` §4.2 한정값 총합 vs 호스트 사양

| 워커 수 N | 전체 cpus 총합 | 전체 mem 총합 | 호스트 cpus 여유 | 호스트 mem 여유 |
|-----------|----------------|---------------|------------------|-----------------|
| N=1 | 6.0 | ~3 GB | ✅ (12 ≥ 6) | ✅ (32 ≥ 3) |
| N=2 | 7.0 | ~3.5 GB | ✅ (12 ≥ 7) | ✅ |
| N=5 | 10.0 | ~5 GB | ✅ (12 ≥ 10) | ✅ |
| N=10 | 15.0 | ~7.5 GB | ⚠️ (12 < 15, over-commit) | ✅ |

전체 총합 계산: redis 1.0 + api 1.0 + worker × N + prometheus 0.5 + grafana
0.5 + k6 2.0.

### §4 단계 6 기준 3건 평가

1. **N=1 기준 전체 한정값 총합 ≤ 호스트 코어 수** — `6.0 ≤ 12` ✅
2. **호스트 RAM ≥ 3 GB (총합)** — `32 ≥ 3` ✅
3. **N=5/10 worker × N cpus ≤ 호스트 코어 - 1** — `N=5: 5 ≤ 11` ✅,
   `N=10: 10 ≤ 11` ✅

### 결론 + 후속 영향

- **N=1/2/5 (M-LOAD-2~5 기본 경로):** §4 단계 6 의 3건 기준 모두 통과. 전체
  cgroup 총합도 호스트 여유 안. cgroup 격리 의미 손상 없음.
- **N=10 (M-LOAD-5):** §4 단계 6 의 3건 기준은 모두 통과(worker × N = 10 ≤
  호스트 코어-1 = 11). 보조 관찰 — 전체 6 서비스 cgroup 총합(15.0 cpus)이
  호스트 코어(12)를 over-commit 하므로 측정 시 cgroup 격리 의미가 약해질 가능성
  존재. M-LOAD-5 진입 전 PRD
  [`../prd-phase4/04-horizontal-scaling.md`](../prd-phase4/04-horizontal-scaling.md)
  §2.3 정합 재검토 권장 — 매트릭스 축소 결정은 사용자 위임.
- **호스트 사양 미달 없음** — M-LOAD-1 종료 시점에서 본 마일스톤은 그대로
  closeout 가능. M-LOAD-2 진입 차단 사유 없음.

## 6. 수용 기준 / Done 정의

본 절은 outline `01-milestones.md` §3 M-LOAD-1 의 Exit Criteria 와 글자 단위
정합 + 본 마일스톤 보강 항목.

- [ ] `docker-compose.yml` 에 `k6` 서비스 추가. `depends_on` 에 `api` (service_healthy)
  + `worker` (service_started). cgroup 한정값(`deploy.resources.limits.cpus` /
  `memory`) 명세 (Q-LOAD-2 정합).
- [ ] `docker/k6/` 디렉터리 + `scenarios/` + `results/` + `scripts/` 골격 + 측정
  호스트 메타데이터 헬퍼 스크립트(`collect-metadata.sh`) — CPU/메모리/OS/Docker/
  k6 버전/git commit/측정 일시 수집 (PRD `02` §5.1 의 필수 8 항목).
- [ ] `docs/prd-phase4/results/` 디렉터리 + `README.md` (보고서 형식 정합 + 명명
  규칙 + commit 정책 cross-link).
- [ ] 회귀 가드: `pnpm typecheck` 0 errors, `pnpm test` 그린 (UT + IT 전건),
  `docker compose config` pass, 1~3단계 IT + UT 전건 그린.

### 보강 항목 (본 마일스톤 단위)

- [ ] `docker compose --profile measure config` 가 `k6` 서비스 등장 + `profiles:
  ["measure"]` 가 일반 `docker compose up` 에서 k6 비실행.
- [ ] `.env.example` 에 `K6_TARGET_URL` / `K6_API_BEARER_TOKEN` /
  `K6_PROMETHEUS_RW_SERVER_URL` 3건 등장. 기존 키 값/순서 변경 0건.
- [ ] `docker/prometheus.yml` 본문 변경 0건. command 플래그 `--web.enable-remote-write-receiver`
  는 `docker-compose.yml` 의 prometheus 서비스 command 절에서 추가.
- [ ] 호스트 사양 호환성 체크(§4 단계 6) 통과 — 6 서비스 cgroup 한정값 총합이
  측정 호스트 사양 안.
- [ ] 본 PLAN 범위 안 파일만 수정 — outline 3 파일 mtime 변경 0건, `packages/`
  변경 0건, `docs/prd-phase4/00~05.md` 변경 0건.

## 7. PRD 역참조

| 본 마일스톤 항목 | PRD 절 |
|------------------|---------|
| k6 서비스 추가 (단계 1) | `prd-phase4/02` §2 (k6 선택 사유) + §3 (잠정 YAML 형태) |
| prometheus command 플래그 (단계 2) | `prd-phase4/02` §2.2 (Prometheus remote write 내장) |
| `docker/k6/` 디렉터리 (단계 3) | `prd-phase4/02` §3.1 (잠정 YAML 의 볼륨 마운트) |
| 메타데이터 헬퍼 (단계 4) | `prd-phase4/02` §5 (측정 호스트 메타데이터 형식) |
| `docs/prd-phase4/results/` (단계 5) | `prd-phase4/02` §6 (Q-LOAD-12 (a) Markdown) |
| cgroup 호환성 체크 (단계 6) | `prd-phase4/02` §4.2 (cgroup 한정값 표) + §4.3 (호환성 메모) |
| `.env.example` (단계 7) | `prd-phase4/05` §4 C-LOAD-5 |

## 8. 결정 의존

- **Q-LOAD-1** (a) k6 (Grafana Labs) — 단계 1 docker-compose `k6` 서비스.
- **Q-LOAD-2** (b) 로컬 + cgroup 격리 — 단계 1 cgroup 한정값 + 단계 6 호환성 체크.
- **Q-LOAD-12** (a) Markdown 표 — 단계 5 results 디렉터리 + README 형식.
- **Q-LOAD-13** (a) IT-LOAD-N 없음 — 본 마일스톤이 회귀 가드 추가 0건.
- **1~3단계 결정 정합:** Q-OBS-2 (a) (`/metrics` 200 유지) — 본 마일스톤이 변경
  하지 않음. Q-OBS-3 (a) (`WORKER_METRICS_PORT`) — 기존 환경변수 보존.

> 모든 결정 2026-05-27 Resolved.

## 9. 회귀 점검

본 마일스톤이 끝나는 시점에 다음이 모두 그린:

- `pnpm typecheck` 0 errors.
- `pnpm test:unit` — UT-1~6 + 보강(metrics-c-catalog, metrics-d-w-catalog).
- `pnpm test:integration` — IT-S1, IT-S1b, IT-S2, IT-S2b, IT-S3, IT-S4, IT-S5,
  IT-S6, IT-S6b, IT-S7, IT-R1, IT-OBS-1~12.
- `docker compose config` 유효 + 기존 5 서비스 그대로 + `k6` 서비스 등장(profile
  분리).
- `docker compose up` (k6 제외) 후 1~3단계 데모 정상 — `curl POST /webhooks` →
  202, 외부 수신자 도착, Grafana 4 대시보드 자동 import, Prometheus targets
  `up=1`.
- **부수 효과 0건 검증:** `packages/` 코드 변경 없음 → 핸들러/워커 hot path 영향
  없음. IT-S3 fake timer 단언, IT-S2 멱등성, IT-S7 셧다운 시퀀스, IT-OBS-9 셧다
  운 진행 중 `/metrics` 200 유지 등 모두 그대로.

## 10. 본 마일스톤 후 데모 상태

- 일반 `docker compose up` → redis + api + worker + prometheus + grafana 5 서비스
  기동 (3단계 종료 상태 그대로).
- `docker compose --profile measure up k6` → 6번째 서비스 `k6` 가 시나리오 파일이
  없으므로 즉시 종료 (시나리오는 M-LOAD-2 부터 채움). 본 마일스톤 종료 시점에는
  k6 컨테이너의 정상 기동만 확인하고 측정은 실행하지 않는다.
- `docs/prd-phase4/results/` 디렉터리가 등장 + `README.md` 가 보고서 형식 잠금.
  실제 결과 보고서는 M-LOAD-2 부터 commit.
- `docker/k6/scripts/collect-metadata.sh` 가 호스트 측에서 실행 가능 — 메타데이터
  형식 시연(단, 측정 사이클에서의 사용은 M-LOAD-2 부터).
- **다음 마일스톤(M-LOAD-2) 진입 가능 조건:** §6 Done 정의 전건 + 본 §9 회귀 가드
  전건 그린 + outline 3 파일 변경 0건 + 본 PLAN 안 파일만 수정.
