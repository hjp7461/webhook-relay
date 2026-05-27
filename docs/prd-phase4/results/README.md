# `docs/prd-phase4/results/` — 4단계 부하 측정 결과 보고서 단일 출처

> M-LOAD-1 단계 5 가 본 디렉터리의 보고서 형식 + 명명 규칙을 잠근다
> (PLAN `../../plan-phase4/02-m-load-1-bootstrap.md` §4 단계 5). 본 마일스톤은
> 형식 잠금만 수행하며 실제 LP-N 결과 보고서는 M-LOAD-2~6 이 commit 한다.

---

## 1. 단일 출처 안내

- **결과 보존 위치:** 본 디렉터리(`docs/prd-phase4/results/`)가 4단계 부하 측정의
  모든 결과 보고서의 **단일 출처** (불변식 I4.10, PRD
  [`../02-measurement-tools-and-environment.md`](../02-measurement-tools-and-environment.md) §6.4).
- **`.gitignore` 대상 아님** — 결과는 PR 로 commit 되어 추적된다.
- **결정 정합:** Q-LOAD-12 (a) Markdown 표 (PRD `02` §6 + Q-LOAD 잠금 표
  `../00-decisions-needed.md`). 본 저장소의 톤 일치 + PR 리뷰 가독성 + 측정
  횟수 ≤ 수십 회 규모가 Markdown 표 형식에 부합.
- **k6 raw output 임시 보관 위치:** `../../../docker/k6/results/` (별도 디렉터리).
  raw artifact (`k6-*.json` 등) 은 `.gitignore` 대상 (PLAN
  `08-cross-cutting.md` §2 잠정 권고, M-LOAD-2 단계 6).

---

## 2. 결과 보고서 명명 규칙

PLAN `../../plan-phase4/08-cross-cutting.md` §2 의 명명 규칙을 본 §2 가 mirror.

| 종류 | 파일명 형식 | 예시 |
|------|-------------|------|
| LP-N 측정 | `<LP-ID>_<YYYY-MM-DD>.md` | `LP-1_2026-06-01.md` |
| LP-2 4 변형 | 단일 파일 안의 4 행 (행 단위 변형 분리) | `LP-2_2026-06-08.md` |
| 수평 확장 | `horizontal-scaling_<YYYY-MM-DD>.md` | `horizontal-scaling_2026-06-15.md` |
| knee point 정밀 (M-LOAD-6 선택) | `micro-n-matrix_<YYYY-MM-DD>.md` | `micro-n-matrix_2026-06-21.md` |
| 최종 종합 | `final_<YYYY-MM-DD>.md` | `final_2026-06-22.md` |

- 날짜는 측정 종료 일자(ISO 8601 `YYYY-MM-DD`). 정확한 시각은 보고서 본문
  메타데이터 헤더 `started_at` / `ended_at` 이 단일 출처(ISO 8601 UTC).
- 본 §2 와 PLAN `08` §2 가 어긋나면 PLAN 이 우선이며 본 README 가 갱신 대상.

---

## 3. 보고서 본문 형식

각 보고서는 3 절로 구성 — YAML 메타데이터 헤더 → 측정 결과 표 → (필요 시) 실패 사유 절.

### 3.1 YAML 메타데이터 헤더 (PRD `02` §5.2 정합)

```yaml
---
measurement:
  id: <YYYY-MM-DDTHH-MM-SSZ>_<LP-ID>_N<n>
  started_at: <ISO 8601 UTC>
  ended_at:   <ISO 8601 UTC>
  git_commit: <40-hex>
  hostname: <측정 호스트명>
  host:
    cpu_model: "<문자열>"
    cpu_ghz: <float>
    ram_gb: <int>
    os: "<문자열>"
  docker_version: "Server <ver> (Client <ver>)"
  k6_version: "<문자열>"
  cgroup:
    api:        { cpus: <float>, mem: <문자열> }
    worker:     { cpus: <float>, mem: <문자열>, instances: <int> }
    redis:      { cpus: <float>, mem: <문자열> }
    prometheus: { cpus: <float>, mem: <문자열> }
    grafana:    { cpus: <float>, mem: <문자열> }
    k6:         { cpus: <float>, mem: <문자열> }
  redis_topology: "single-instance"
  load_profile:
    lp_id: <LP-ID>
    rps: <int>
    payload_distribution: { small: <ratio>, medium: <ratio>, large: <ratio> }
    pattern: <steady|burst|spike>
    window:
      warmup_s:   <int>
      load_s:     <int>
      cooldown_s: <int>
---
```

- 필수 8 항목은 PRD `02` §5.1 의 표가 단일 출처. 누락 시 결과 무효(§3.3 무효
  조건 1).
- 메타데이터 자동 수집 헬퍼: `../../../docker/k6/scripts/collect-metadata.sh`
  가 `started_at` / `git_commit` / `hostname` / `host.*` / `docker_version` /
  `k6_version` 을 출력. `id` / `ended_at` / `cgroup` / `redis_topology` /
  `load_profile` 은 측정 실행 스크립트(M-LOAD-2 부터)가 별도 갱신.

### 3.2 측정 결과 표 (Markdown)

행 = SLI 단위, 열 = p50 / p99 / 평균 / 분산(stdev) (PRD
[`../03-targets-and-rebaseline.md`](../03-targets-and-rebaseline.md) §3.3 정합).

| SLI | 단위 | p50 | p99 | 평균 | 분산 |
|-----|------|-----|-----|------|------|
| SLO-1 가용성 (5xx 비율) | % | | | | |
| SLO-2 등록 지연 p99 | ms | | | | |
| SLO-3 전달 지연 p99 | ms | | | | |
| SLO-4 DLQ 적재율 | % | | | | |
| 처리량 (RPS achieved) | RPS | | | | |
| 큐 길이 (waiting) | count | | | | |
| W3 attempts 분포 | attempts/job | | | | |

- 행 목록은 잠정. LP-N 별 정확한 SLI 단일 출처는 PRD `03` §2 표.
- 단위는 항상 명시. `n/a` 는 측정 불가, 빈 셀은 미수집.

### 3.3 실패 사유 절 (측정 무효 시만)

PRD `03` §3.4 의 무효 조건 5건 중 어느 것이 발동했는지 명시한다.

| # | 무효 조건 | 발동 | 사유 / 관측 |
|---|-----------|------|--------------|
| 1 | PRD `02` §5.1 메타데이터 누락 | yes/no | |
| 2 | PRD `02` §7.2 측정 분산 ±5% 초과 | yes/no | |
| 3 | PRD `03` §2.3 카디널리티 가드 위반 | yes/no | |
| 4 | Prometheus `target up = 0` 구간이 W_load 안에 존재 | yes/no | |
| 5 | k6 의 RPS 도달률이 목표 R 의 ±2% 벗어남 | yes/no | |

무효 보고서는 본 절을 채우고 commit 한다. 사용자 검토 후 재측정 결정 — 절차는
PLAN `../../plan-phase4/08-cross-cutting.md` §7 (측정 분산 ±5% 초과 처리 절차)
정합.

---

## 4. commit 정책

본 디렉터리의 보고서 commit 정책 단일 출처는 PLAN
`../../plan-phase4/08-cross-cutting.md` §2. 요지:

- 측정 사이클 = "측정 실행 → 결과 추출 → 보고서 작성 → commit → push" 의 1
  사이클.
- 부분 실패(측정 무효 조건 발동) 시 §3.3 "실패 사유" 절을 채워 commit + 사용자
  검토 후 재측정 결정.
- raw artifact (`docker/k6/results/<id>/k6-*.json` 등) 은 `.gitignore` 대상.
- 본 README 의 형식 위반은 PR 리뷰에서 거부 (PLAN `08` §2 "위반 시 검출"). M-LOAD-6
  최종 보고서 작성 시 M-LOAD-2~5 보고서의 명명 규칙 / 형식 정합을 일괄 검증.

---

## 5. 도입 시점 매트릭스

| 마일스톤 | 본 디렉터리에 대한 변경 |
|---------|--------------------------|
| **M-LOAD-1** | 본 `README.md` 가 형식 + 명명 규칙 잠금. 실제 보고서 파일 0건. |
| **M-LOAD-2** | `LP-1_<date>.md` commit (baseline). |
| **M-LOAD-3** | `LP-2_<date>.md` commit (nominal sustained, 4 변형). |
| **M-LOAD-4** | `LP-3_<date>.md` + `LP-4_<date>.md` commit (stress + spike). |
| **M-LOAD-5** | `horizontal-scaling_<date>.md` commit. |
| **M-LOAD-6** | (선택) `micro-n-matrix_<date>.md` + `final_<date>.md` commit. |
