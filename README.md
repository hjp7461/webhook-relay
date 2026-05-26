# Reliable Webhook Queue

BullMQ(Redis) 기반의 **신뢰성 있는 웹훅 전송 작업 큐**.
전송 실패 시 지수 백오프로 재시도하고, 최대 재시도를 초과하면 DLQ로 격리하며,
처리 상태를 실시간 대시보드와 Prometheus 메트릭으로 관측합니다.

> 이 프로젝트의 목적은 "가장 빠른 큐"를 만드는 것이 아니라, 프로덕션급 작업 큐가
> 갖춰야 할 보장(전달 보장 · 멱등성 · 재시도 · DLQ · 그레이스풀 셧다운 · 관측성)을
> **검증된 라이브러리 위에서 올바르게 조립하는 판단력**을 보여주는 것입니다.

---

## 데모

> _(여기에 30초 데모 GIF: 작업 등록 → 처리 → 워커를 죽여도 자동 회수되는 장면 → 대시보드)_

---

## 빠른 시작

```bash
pnpm install
docker compose up
# API: http://localhost:3000
# 대시보드: http://localhost:3000/dashboard
# Grafana: http://localhost:3001
```

웹훅 작업 하나 등록해 보기:

```bash
curl -X POST http://localhost:3000/webhooks \
  -H 'Content-Type: application/json' \
  -d '{ "url": "http://localhost:3000/_test/receiver", "payload": { "hello": "world" } }'
```

워커를 늘려서 수평 확장 확인:

```bash
docker compose up --scale worker=5
```

---

## 아키텍처

```
Producer ──add──> BullMQ Queue ──> Worker pool (수평 확장)
                                      │
                            성공: complete   실패: 재시도(지수 백오프)
                                      │                  │
                                  메트릭 기록      최대 초과 → DLQ
관측성: 처리량/지연/대기열 길이/DLQ → Prometheus → Grafana
```

| 컴포넌트 | 역할 |
|----------|------|
| Producer | 웹훅 작업 등록, 멱등성 키 부여 |
| Worker | 작업 소비, 웹훅 전송, 결과 처리 |
| Retry/DLQ | 백오프 재시도, 재시도 불가/초과 시 격리 |
| Observability | 메트릭 노출 및 대시보드 |

> 상세 다이어그램과 컴포넌트 설명은 `docs/architecture.md`.

---

## 설계 의사결정 (Design Decisions)

> 이 섹션이 이 저장소의 핵심입니다. 각 항목은 **문제 → 선택지 → 결정과 근거 → 한계**
> 형식으로 정리합니다. (현재는 뼈대이며, 구현과 함께 채워 나갑니다.)

### D1. 전달 보장: at-least-once + 멱등성
- **문제:** 워커가 작업을 처리하고 ACK하기 직전에 죽으면? 중복 전송 위험.
- **선택지:** exactly-once(환상에 가깝고 비용이 큼) vs at-least-once + 애플리케이션 멱등성.
- **결정:** at-least-once를 받아들이고, 모든 웹훅 작업에 멱등성 키를 강제해
  수신 측에서 중복을 흡수할 수 있게 한다. _(근거 채울 자리)_
- **한계:** 멱등성 키 관리 책임이 작업 정의자에게 있다. _(보완 방안 채울 자리)_

### D2. 재시도 전략과 DLQ
- **문제:** 일시적 실패(네트워크, 5xx)와 영구적 실패(4xx)를 같게 다루면 안 된다.
- **결정:** 재시도 가능/불가 에러를 명시적으로 분류. 가능 에러는 지수 백오프로 N회 재시도,
  초과 시 DLQ로 격리. 불가 에러는 즉시 격리. _(파라미터·근거 채울 자리)_
- **한계:** poison message가 DLQ에 쌓일 때의 운영 절차. _(채울 자리)_

### D3. 그레이스풀 셧다운
- **문제:** 무중단 배포/스케일 인 시 진행 중 작업이 잘리면 안 된다.
- **결정:** SIGTERM 수신 시 새 작업 수신을 멈추고 진행 중 작업을 마친 뒤 종료. _(채울 자리)_

### D4. 기술 선택: 왜 BullMQ인가 (vs Raw Redis Streams, vs Kafka)
- **vs Raw Streams:** BullMQ는 내부적으로 Redis Streams 위에 구현되어 있으며,
  재시도·DLQ·스케줄링·stalled-job 회수를 직접 짜는 대신 검증된 추상화를 쓴다.
  "추상화의 비용"은 별도 부록(부록 트랙)에서 직접 구현과 벤치마크로 정량 분석할 예정.
- **vs Kafka:** 작업 큐(개별 작업의 신뢰성 있는 실행)와 이벤트 스트리밍(durable·replayable
  로그)은 다른 문제를 푸는 도구다. 웹훅 재시도 워크로드는 전형적 작업 큐 영역이며,
  Kafka의 브로커/파티션 운영 복잡성과 까다로운 재시도 모델은 이 규모에 과하다.
  _(상세 ADR은 추후 `docs/adr/` 에 별도 문서로 작성)_

---

## 테스트

```bash
pnpm test            # 전체
pnpm test:unit       # 단위 (Redis 불필요)
pnpm test:integration # 통합 (Testcontainers로 실제 Redis 기동)
```

장애 복구·동시성 시나리오는 모킹이 아니라 **실제 Redis 컨테이너**로 검증합니다.
검증 시나리오 목록은 `CLAUDE.md` §5 참조.

---

## 벤치마크

> _(채울 자리)_ 워커 수에 따른 처리량 변화, 처리 지연 분포(p50/p99)를 수치로 기록.

---

## AI-Assisted Development

이 프로젝트는 Claude Code와 함께 개발했으며, **설계와 검증의 책임은 사람에게 두는**
원칙으로 진행했습니다.

- 동시성·장애 복구처럼 까다로운 로직은 **불변식(invariant)을 먼저 정의**하고,
  핵심 시나리오의 **테스트를 먼저 작성**한 뒤 구현을 AI에 위임했습니다.
- AI가 생성한 코드는 엣지 케이스(워커 중도 사망, 중복 전송, poison message) 관점에서
  리뷰해 교정했습니다.
- 프로젝트 규칙(아키텍처 경계, 코딩 컨벤션, 테스트 정책, 범위 통제)을 `CLAUDE.md`에
  명문화해 AI가 일관되게 따르도록 강제했습니다.

> 요지는 "AI가 코드를 짜줬다"가 아니라 **"AI를 규율 있는 협업자로 다뤘다"**입니다.
> 규칙 정의 → 테스트 우선 → 위임 → 리뷰의 루프가 이 저장소 곳곳에 남아 있습니다.

---

## 로드맵

- [ ] 1단계 — MVP: 작업 등록 → 워커 처리 → 대시보드 표시
- [ ] 2단계 — 장애 복구: 멱등성, 백오프 재시도, DLQ, stalled-job 회수
- [ ] 3단계 — 관측성: Prometheus 메트릭 + Grafana 대시보드
- [ ] 4단계 — 부하 테스트 + 그레이스풀 셧다운 + 수평 확장 측정
- [ ] (부록) Raw Redis Streams로 큐 내부 직접 구현 + 추상화 비용 벤치마크

---

## 라이선스

MIT _(예정)_
