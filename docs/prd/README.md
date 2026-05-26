# PRD Index — Reliable Webhook Queue

이 디렉터리는 본 저장소의 **1~2단계 범위**(MVP + 장애 복구)에 대한 제품 요구 문서(PRD) 묶음입니다.
구현 코드는 본 PRD가 승인된 뒤 **후속 PLAN 단계**에서 작성합니다. 본 PRD 단계에서는 코드(소스
파일, package.json 등)를 작성/수정하지 않습니다.

> 단일 소스 오브 트루스: 본 PRD가 `CLAUDE.md`·`README.md`와 충돌하면 **`CLAUDE.md`가 우선**합니다.
> 본 PRD는 `CLAUDE.md`를 어기지 않는 범위 안에서만 의사결정을 합니다.

## 읽는 순서

| # | 파일 | 한 줄 설명 |
|---|------|------------|
| 00 | [`00-overview.md`](./00-overview.md) | 비전·목표/비목표·대상 사용자·성공 지표·트랙 구분·용어집 |
| 01 | [`01-mvp.md`](./01-mvp.md) | 1단계 MVP: 작업 등록 → 워커 처리 → 데모 수신 → 최소 대시보드 |
| 02 | [`02-resilience.md`](./02-resilience.md) | 2단계 장애 복구: 멱등성·재시도·DLQ·stalled-job 회수와 불변식 |
| 03 | [`03-test-strategy.md`](./03-test-strategy.md) | CLAUDE.md §5 7개 시나리오의 검증 요구사항 매핑, 단위/통합 경계 |
| 04 | [`04-architecture-boundaries.md`](./04-architecture-boundaries.md) | `core`(도메인 비의존) vs `demo`(웹훅) 경계, 데이터 흐름(ASCII) |
| 05 | [`05-api-and-contracts.md`](./05-api-and-contracts.md) | 작업 등록 API·작업 페이로드 스키마·환경변수·로깅 컨텍스트 |
| 06 | [`06-security-and-ops.md`](./06-security-and-ops.md) | HMAC 서명·타임아웃·시크릿 처리·Redis 재연결·그레이스풀 셧다운(2단계 범위) |
| 07 | [`07-out-of-scope-and-future.md`](./07-out-of-scope-and-future.md) | 3~4단계·부록 트랙의 명시적 Out-of-Scope 처리와 오픈 퀘스천 |

## 본 PRD의 범위 한 줄 요약

> **`core` 패키지에 도메인-무관한 큐/워커/재시도/DLQ/셧다운 추상화를 두고, `demo` 패키지에
> 웹훅 전송 도메인 로직과 Fastify API·최소 대시보드를 둔다. 1단계에서 해피패스를, 2단계에서
> 장애 복구 불변식을 충족한다. 관측성(3단계)과 부하·셧다운 측정(4단계), 부록의 streams-internals는
> 본 PRD에서 다루지 않는다.**

## AI 협업 5원칙 (CLAUDE.md §7 인용)

모든 PRD 문서는 다음 5원칙을 전제로 한다.

1. **설계는 사람이 먼저 한다.** 동시성·장애 복구의 불변식은 사람이 정의한다.
2. **테스트 우선.** §5의 7개 핵심 시나리오는 구현 전 테스트가 먼저 존재한다.
3. **범위를 넘지 않는다.** 요청받지 않은 기능·추상화·의존성을 추가하지 않는다.
4. **불확실하면 멈추고 묻는다.** 임의 결정 대신 `07-out-of-scope-and-future.md`의 오픈 퀘스천에 선택지를 남긴다.
5. **CLAUDE.md를 위반하는 기존 코드/요구를 발견하면** 조용히 고치지 말고 먼저 보고한다.
