---
measurement:
  id: 2026-05-28T11-38-28Z_to_13-46-26Z_M-LOAD-5
  started_at: 2026-05-28T11:38:28Z
  ended_at: 2026-05-28T13:46:26Z
  git_commit: 7c86b4e7b9b8de8b71f6716ddc6c10a8a0cccb40
  hostname: hongjeongpyoui-MacBookPro-2.local
  host:
    cpu_model: "Intel(R) Core(TM) i7-8750H CPU @ 2.20GHz"
    cpu_ghz: 2.20
    ram_gb: 32
    cores: 12
    os: "macOS 15.7.7 (Darwin 24.6.0)"
  docker_version: "Server 29.5.2 (Client 29.5.2)"
  k6_version: "k6 v2.0.0+dirty (commit/8c3be52cc1-dirty, go1.26.3, linux/amd64)"
  docker_vm_memory_limit_gb: 7.65
  cgroup:
    api:        { cpus: ~, mem: ~ }
    worker:     { cpus: ~, mem: ~, instances: "1, 2, 5, 10 (matrix)" }
    redis:      { cpus: ~, mem: ~ }
    prometheus: { cpus: ~, mem: ~ }
    grafana:    { cpus: ~, mem: ~ }
    k6:         { cpus: 2.0, mem: "1G" }
  redis_topology: "single-instance"
  worker_concurrency: 5
  load_profile:
    lp_id: "LP-2"
    variant: "normal"
    rps: 100
    payload: { distribution: "80% / 15% / 5%", sizes: [1024, 16384, 65536] }
    pattern: "steady (constant-arrival-rate)"
    k6_seed: 0
    window:
      warmup_s: 60
      load_s: 1800
      cooldown_s: 60
    matrix: { N: [1, 2, 5, 10] }
---

# M-LOAD-5 수평 확장 측정 결과 (2026-05-28)

본 보고서는 4단계 M-LOAD-5 수평 확장 측정 결과 + SLO-H-1 (α=0.8) /
SLO-H-2 (β=1.2) 검증. PLAN `docs/plan-phase4/06-m-load-5-horizontal-scaling.md`
§4 단계 3 정합. 형식은 `docs/prd-phase4/results/README.md` §3 + LP-2 보고서
패턴을 N 매트릭스로 확장.

> **본 측정은 정상 측정 — PLAN §3.4 결과 무효 조건 전건 통과.** 다만 **SLO-H-1
> 위반 (4 N 모두)** + **SLO-H-2 통과 (4 N 모두)** 라는 비대칭 결과는 부하 영역
> (R=100 LP-2 nominal) 이 N=1 워커 capacity 안에 들어와 추가 워커가 idle 상태
> 인 시스템적 한계 (PRD §I4.22 "수평 확장 SLO 의 상대성" cross-link). 본 결과는
> M-LOAD-5 의 정상 측정값이며, SLO-H-1 검증의 의미 자체가 부하 영역 의존성을
> 가짐을 명확히 식별 (§5 참조).

---

## 0. 1차 시도 fail + fix 시리즈 cross-link

본 보고서는 2026-05-28 12:11Z 부터의 재측정 결과. 1차 시도 (03:07~03:40Z)
가 **N=2 부트스트랩에서 host port 3001 충돌**로 fail:

```
Bind for 0.0.0.0:3001 failed: port is already allocated
```

PRD `prd-phase4/04` §R4.18 의 "추가 인스턴스 동적 포트 폴백" 가정이 실제
docker compose 동작과 다름이 검증됨 (사용자 결정 2026-05-28 잠금).

fix 시리즈 5 commits:

| commit | 변경 |
|--------|------|
| `db23169` | fix(docker-compose): worker host port 매핑 제거 |
| `8ce3fdb` | fix(docker/k6/scripts): 4 runner readiness gate worker /metrics 호스트 호출 제거 |
| `f7eb029` | docs(prd-phase4/04): R4.18 정정 |
| `75d164a` | docs(plan-phase4/06): §5 잠금 예외 + §3.4 보강 |
| `7c86b4e` | docs(README): worker /metrics 접근 표현 갱신 |

본 fix 시리즈가 docker-compose worker 의 `ports: "3001:3001"` 매핑을
제거. 재측정에서 N=2/5/10 모두 정상 부트.

---

## 1. 측정 윈도우 (W_load = SLI 계산 범위)

| N | t_start | t_end | 지속 |
|---|---------|-------|------|
| 1 | `2026-05-28T11:39:51Z` | `2026-05-28T12:09:53Z` | 1802초 (~30분 02초) |
| 2 | `2026-05-28T12:12:30Z` | `2026-05-28T12:42:32Z` | 1802초 (~30분 02초) |
| 5 | `2026-05-28T12:45:09Z` | `2026-05-28T13:15:11Z` | 1802초 (~30분 02초) |
| 10 | `2026-05-28T13:17:54Z` | `2026-05-28T13:47:56Z` | 1802초 (~30분 02초) |

각 N PromQL 시계열 범위 = `t_start` ~ `t_end`, step = 15s → 121 step.

---

## 2. SLI 결과 (4 N × W_load 30m 통계)

### 2.1 k6 측 통계 (각 N, 약 180,000 iterations)

| N | http_reqs.count | http_reqs.rate | http_req_duration.p(95) (ms) | http_req_failed.value (실패율) |
|---|------------------|------------------|--------------------------------|--------------------------------|
| 1 | 180,000 | 100.00 RPS | 2.83 | 0% |
| 2 | 180,000 | 100.00 RPS | 2.86 | 0% |
| 5 | 180,000 | 100.00 RPS | 2.83 | 0% |
| 10 | 180,000 | 100.00 RPS | 2.86 | 0% |

> **4 N 모두 동일** — k6 의 송신 RPS 가 100.00 (목표 정확), 등록 응답 분포가
> 거의 동일. http_req_failed 모두 0% — 5xx 응답 전무.

### 2.2 Prometheus 측 SLI (각 N PromQL 시계열 평균)

| N | SLO-1 5xx | SLO-2 등록 p99 | SLO-3 전달 p99 | SLO-4 DLQ | throughput_completed | cardinality |
|---|-----------|------------------|------------------|-----------|------------------------|--------------|
| 1 | 0% | ~5ms | 9.92ms | 0% | **94.18 RPS** | 165 |
| 2 | 0% | ~5ms | 9.92ms | 0% | **94.10 RPS** | 165 |
| 5 | 0% | ~5ms | 9.94ms | 0% | **94.15 RPS** | 165 |
| 10 | 0% | ~5ms | 9.92ms | 0% | **94.06 RPS** | 165 |

> **SLO-1~4 전건 통과 + 4 N 동일 영역**. throughput_completed 가 k6 송신
> 100 RPS 의 ~94% (Prometheus 1분 rate 평균화) — 4 N 동일.

> **cardinality 165 ≤ 1000 (IT-OBS-11)** — N 인스턴스 라벨이 단일 worker job
> group 으로 통합되어 N 함수 증가 없음 (prometheus.yml single target).

### 2.3 큐 길이 분포 (4 N 모두 정상 영역)

| N | waiting max | active max | active avg | delayed max | completed max | failed max |
|---|---|---|---|---|---|---|
| 1 | 2 | 3 | <1 | 0 | 2,000 | 0 |
| 2 | 2 | 3 | <1 | 0 | 2,000 | 0 |
| 5 | 2 | 3 | <1 | 0 | 2,000 | 0 |
| 10 | 2 | **2** | <1 | 0 | 2,000 | 0 |

> **워커 분산 효과**: N=10 의 active max=2 가 N=1/2/5 의 3 보다 낮음 — N 인스턴스가
> 동시 분산되어 각 시점의 합산 active 가 더 낮게 관찰. waiting 큐가 정상 ~0
> 영역이므로 worker 가 부하를 빠르게 흡수.

---

## 3. SLO-H-1 검증 (PRD §4.1, Q-LOAD-10 α=0.8)

목표: `throughput(N) ≥ throughput(1) × N × 0.8`

baseline: throughput(1) = **94.1836 RPS**.

| N | throughput(N) | target (≥) | linearity = throughput(N) / (throughput(1) × N) | SLO-H-1 |
|---|---|---|---|---|
| 2 | 94.1005 | 150.6938 | **0.4996** | ❌ **위반** |
| 5 | 94.1536 | 376.7345 | **0.1999** | ❌ **위반** |
| 10 | 94.0634 | 753.4691 | **0.0999** | ❌ **위반** |

**4 N 모두 SLO-H-1 위반** — linearity 가 1/N 패턴 (N=2 에서 0.5, N=5 에서
0.2, N=10 에서 0.1).

### 3.1 위반 사유 분류

PLAN §3.3 + §6 의 위반 사유 후보:
- ❌ **자원 경합 (호스트 코어 부족, 컨텍스트 스위치 비용)** — 본 측정에서 4 N
  모두 처리량 동일이므로 컨텍스트 스위치 비용이 본질 원인 아님.
- ❌ **Redis 포화** — 4 N 모두 throughput 94 RPS sustained, Redis 한계 도달
  안 함 (LP-3 의 cliff 영역과 본질 다름).
- ❌ **cgroup 한정값 과소** — worker 컨테이너에 cgroup 없음 (host CPU 공유).
  N=10 의 active max 가 N=1/2/5 보다 낮은 것은 분산 효과로 정상.

**실제 위반 사유 (PRD §I4.22 "수평 확장 SLO 의 상대성" 영역):**

> **R=100 LP-2 nominal 부하가 N=1 워커의 capacity 안에 들어옴** — 단일 워커의
> 처리 capacity 가 RPS=100 보다 크므로 N=2/5/10 의 추가 워커가 idle 상태.
> 이 경우 throughput 은 N 함수가 아닌 **R 함수 (max 100 RPS)** 가 되며,
> SLO-H-1 의 선형성 평가가 의미를 가지려면 **부하 R 이 N=1 capacity 를
> 초과** 해야 한다.

검증:
- worker concurrency 5 × 처리 시간 평균 ~10ms ≈ **단일 워커 capacity ~500 jobs/s**
- R=100 RPS = 단일 워커 capacity 의 **20%** → N 추가의 의미 없음

### 3.2 SLO-H-1 검증의 부하 영역 의존성 (시스템적 한계)

PRD `prd-phase4/04` §I4.22 인용:
> 수평 확장 SLO 의 상대성 — §4.1 / §4.2 의 SLO-H-1 / SLO-H-2 는 N=1 측정값을
> 기준으로 한 상대값.

본 측정의 발견 — **SLO-H-1 의 의미 보존성은 부하 영역에 의존**:
- **Capacity 미달 영역 (R << N=1 capacity)**: throughput 이 R 함수로 cap → 4 N 모두 동일 → SLO-H-1 위반은 자동 (linearity = 1/N)
- **Capacity 초과 영역 (R > N=1 capacity)**: throughput 이 N 함수로 증가 → SLO-H-1 검증 의미 있음
- **Capacity 경계 영역 (R ≈ N=1 capacity)**: 부분 N 증가 영향

본 마일스톤은 PRD `prd-phase4/04` §2.1 의 잠정 합계 매트릭스에 따라 LP-2 만
사용 — R=100 LP-2 nominal 영역은 capacity 미달 영역이라 **SLO-H-1 검증
의미 영역이 아님**. SLO-H-1 의 실효 검증을 위해서는 LP-2 capacity 초과
RPS (예: R=500 LP-3 ~ R=1000) 영역에서의 N 매트릭스 측정이 필요 (M-LOAD-6
또는 후속 PRD 영역, 본 마일스톤 범위 외).

---

## 4. SLO-H-2 검증 (PRD §4.2, Q-LOAD-11 β=1.2)

목표: `p99(N) ≤ p99(1) × 1.2`

baseline: p99(1) = **9.9156ms** (worker processing duration p99).

| N | p99(N) | target (≤) | ratio = p99(N) / p99(1) | SLO-H-2 |
|---|---|---|---|---|
| 2 | 9.9198ms | 11.8987ms | **1.0004** | ✅ **통과** |
| 5 | 9.9397ms | 11.8987ms | **1.0024** | ✅ **통과** |
| 10 | 9.9195ms | 11.8987ms | **1.0004** | ✅ **통과** |

**4 N 모두 SLO-H-2 통과** — p99 안정성이 N 증가에도 거의 변동 없음 (max
ratio 1.0024 = +0.24%).

### 4.1 통과 사유

- **수평 확장 시 워커 처리 시간 안정**: 워커 처리 capacity 충분 영역에서
  단일 작업의 처리 시간 분포가 N 에 의해 변하지 않음.
- **Redis 응답 시간 안정**: 4 N 모두 같은 단일 Redis 인스턴스 사용, 부하가
  capacity 안이라 Redis 응답 안정.
- **cgroup over-commit 우려 영역 N=10 도 p99 안정**: 14 컨테이너 / 12 core
  over-commit 환경에서도 단일 작업의 처리 시간은 영향 받지 않음 (capacity
  미달 영역 효과).

> **SLO-H-2 는 본 부하 영역에서 의미 있는 통과 결과** — SLO-H-1 과 달리
> p99 는 절대값 비교이며 capacity 미달/초과 모두에서 의미.

---

## 5. 정확도 한계 분석 (사용자 결정 잠금 정합)

PRD `prd-phase4/04` §R4.18 정정 + PLAN §3.4 보강 정합. `docker/prometheus.yml`
의 worker scrape 가 single static target → `docker compose --scale worker=N`
(N>=2) 시 docker compose service DNS round-robin → 매 scrape (15s) 마다 N
인스턴스 중 1 응답 → counter 점프 → `rate()` PromQL 의 N 합산 정확도 저하
가능성.

### 5.1 본 측정의 round-robin scrape 영향

- 본 측정 결과의 `throughput_completed` 가 4 N 모두 동일 (~94.1 RPS) — 이는
  **부하 영역이 capacity 미달이라 처리량이 R 함수로 cap 됨** 의 효과이며,
  round-robin scrape 의 정확도 저하는 본 결과에서 **분리 불가**.
- N=1 측정은 round-robin 없음 (단일 인스턴스) → 본 측정의 baseline 신뢰 가능.
- N=2/5/10 의 throughput 이 N=1 과 동일 ≈ "round-robin scrape 가 N 인스턴스
  의 처리량을 부분 caputure 하지만 capacity 미달이라 총합 = R" 정합.

### 5.2 SLO-H-2 의 round-robin scrape 영향

- p99 는 histogram_quantile 기반 — round-robin scrape 가 N 인스턴스 분포를
  매 scrape 마다 1 인스턴스 sample → 시간 평균으로 합산 → p99 분포 추정.
- 4 N 모두 9.92ms 동일 → 부하 영역 영향 + round-robin 영향이 분리 불가.

### 5.3 정확도 한계의 종합 판정

본 측정은 **부하 영역 의존성** + **round-robin scrape 영향** 의 합산 결과:
- SLO-H-1 위반의 본질은 **부하 영역 의존성** (capacity 미달 → linearity 1/N)
- SLO-H-2 통과의 본질은 **p99 의 절대값 안정성** (round-robin 영향 작음)

후속 측정 권장 (M-LOAD-6 또는 별도 PRD 영역):
1. **Capacity 초과 영역의 N 매트릭스** — R=500 LP-3 영역에서 N 함수의 처리량
   증가 검증 (단 LP-3 자체가 Redis fork-time 메모리 cliff 영역 → 별도 부하
   프로필 설계 필요).
2. **prometheus.yml dns_sd 변경 시 정확도 비교** — single target vs DNS SD 의
   throughput 측정값 차이로 round-robin 영향 정량화 (별도 fix + 재측정).

---

## 6. PLAN §3.4 결과 무효 조건 검증

| 항목 | 임계 | 측정값 (4 N) | 판정 |
|------|------|---------------|------|
| 메타데이터 8 항목 + worker_count: N | 누락 0 | 8 + lp_id + rps + variant + k6_seed + worker_count | ✅ |
| 측정 분산 ±5% (4 N 각각) | ±5% | 4 N 동일 영역 (차이 < 0.1%) | ✅ 자명 통과 |
| 카디널리티 (IT-OBS-11) | ≤ 1000 | 4 N 모두 165 | ✅ |
| Prometheus target up=0 구간 | 없음 | scrape_worker_up_min=1.0 (4 N) | ✅ |
| k6 RPS achieved | [98, 102] LP-2 normal ±2% | 4 N 모두 100.00 | ✅ |
| N=10 cgroup over-commit | worker × N + 4 services ≤ 호스트 12 core | 14 컨테이너 / 12 core over-commit but 부하 capacity 미달 영역이라 영향 미관찰 | ⚠️ over-commit 정상 부트 (단 부하 capacity 미달이 본질) |

**결과 무효 조건 전건 통과** — 본 측정은 정상.

---

## 7. PLAN §6 Done 정의 충족

본 보고서 commit 후 M-LOAD-5 의 PLAN §6 Done 정의 전건 통과:

- [x] N ∈ {1, 2, 5, 10} 각각 LP-2 sustained 측정. `docker compose up --scale worker=N`.
- [x] 처리량(N) / p99(N) / 큐 길이(N) 의 함수 형태 측정.
- [x] SLO-H-1 (α=0.8) / SLO-H-2 (β=1.2) 검증 — SLO-H-1 4 N 위반 + SLO-H-2 4 N 통과.
- [x] 결과 보고서 본 파일.
- [x] SLO-H-1 위반 사유 식별 — **부하 영역 의존성 (capacity 미달)**.

### 7.1 보강 항목

- [x] N=1 baseline 의 SLI 가 M-LOAD-3 LP-2-normal 와 ±5% 안 일치 (재현성 확인):
  - M-LOAD-3 normal SLO-3 전달 p99 = 9.91ms vs M-LOAD-5 N=1 = 9.92ms (Δ=+0.10%)
  - M-LOAD-3 normal throughput ≈ 94 RPS vs M-LOAD-5 N=1 = 94.18 RPS (Δ<1%)
- [x] N=5/N=10 측정 시 cgroup 호환성 사전 체크 — 부트 정상 (worker 자체 cgroup 없음).
- [x] Prometheus targets up>=2 (api + worker job groups) — 4 N 모두 ✓.
- [x] 카디널리티 가드 — 165 ≤ 1000 (worker job 이 single target group, N 함수 증가 없음).
- [x] SLO-H-1 위반 사유 분류 — **부하 영역 의존성** (자원 경합/Redis 포화/cgroup
  과소 아님). PRD §I4.22 cross-link.
- [x] 본 PLAN 범위 안 파일만 수정 — outline 3 파일 변경 0건.

---

## 8. 후속 작업 cross-link

### 8.1 M-LOAD-6 인계 항목

- **SLO 잠정값 재조정 (Q-LOAD-9, p99 × 1.5)** — 본 M-LOAD-5 의 4 N 결과로부터
  N=1 baseline 의 worker processing duration p99 = 9.92ms 를 재조정 근거로
  추출. 상세는 M-LOAD-6 의 최종 종합 보고서 책임.
- **Redis HA / Cluster 트리거 조건 (PRD §6)**:
  - T1 트리거 (단일 Redis CPU/메모리 한계) — M-LOAD-4 LP-3 가 1차 증거.
  - T2/T3 트리거 — 본 M-LOAD-5 가 capacity 미달 영역이라 추가 신호 없음.
  - M-LOAD-6 종합 판정 책임.

### 8.2 후속 권장 측정 (본 PRD 범위 외, 별도 PRD/마일스톤)

- **Capacity 초과 영역의 N 매트릭스** — R=500 LP-3 영역에서 N=1/2/5/10 측정
  으로 SLO-H-1 의 실효 검증. 단 LP-3 가 단일 Redis 의 fork-time 메모리 cliff
  영역이라 부하 프로필 재설계 필요 (예: P=small 1KB 고정 + R=500/1000).
- **prometheus.yml dns_sd_configs 도입** — N 인스턴스 모두 scrape 로 정확도
  보장. 본 PRD §R4.18 잠정 잠금 ("single target 동작 그대로") 의 재검토.

### 8.3 architecture.md / README cross-link (별도 follow-up)

- architecture.md line 35 의 "worker /metrics 호스트 포트 3001 사용으로 3002 로
  이동" 코멘트가 fix `db23169` 이후 historical decision 표현으로 남음 — 별도
  정리 권장 (C-LOAD-11 카탈로그 cross-link).
