---
description: webhook-relay 세션 핸드오프 — /clear 후 본 명령으로 컨텍스트를 다시 로드한다.
---

# 🔁 Resume — webhook-relay 핸드오프

당신은 이 저장소(`webhook-relay`)에서 **이전 세션의 작업을 이어받습니다**. 본 명령의 임무는 다음과 같다.

1. **시점 스냅샷**(`.claude/state/HANDOFF.md`)을 읽는다.
2. **git/test 로 재검증**해 스냅샷이 현재와 일치하는지 확인.
3. **상태 + 다음 작업 + 결정 대기 항목**을 사용자에게 짧게 보고.

> **단일 출처는 git/PLAN/코드**. HANDOFF.md 는 보조 컨텍스트일 뿐이다. 불일치 시 git/PLAN 을 신뢰하고 사용자에게 알린 뒤 진행한다(`/save-state` 로 갱신 권장).

---

## 1. 한 줄 컨텍스트

Redis(BullMQ) 기반의 **신뢰성 있는 웹훅 전송 작업 큐**. PRD → PLAN → 마일스톤별 구현 흐름. 메인 트랙(1~2단계 + 후속 정산 + API/Worker 분리)은 완료. 3단계 관측성 진행 중. 자세한 비전과 규칙은 `CLAUDE.md`.

---

## 2. Read first (이 순서로 정독 — 절대 건너뛰지 말 것)

병렬 가능한 read 는 한 메시지에서 동시 호출:

1. **`.claude/state/HANDOFF.md`** ← 시점 스냅샷. 다음 작업/결정 대기 항목/recent commits 가 여기 있음.
2. **`CLAUDE.md`** — 단일 규칙 소스(§1 트랙 구분, §2 기술 스택, §4 코딩 컨벤션, §5 테스트 정책, §7 AI 협업 5원칙).
3. **`README.md`** — 데모/운영 노트/로드맵.
4. **`docs/architecture.md`** — 시스템 구조 + 보장/비보장 항목.

위 4건 읽고 나서, **HANDOFF.md 가 가리키는 "다음 작업" 마일스톤 PLAN 본문**을 정독:

- 예: HANDOFF.md 가 M-OBS-2 를 다음으로 가리키면 `docs/plan-phase3/03-m-obs-2-core-metrics.md` 정독.
- 1~2단계 마일스톤(M1~M7)이면 `docs/plan/0[2-8]-*.md`.

필요 시 다른 참조:

- 결정 잠금: `docs/plan/00-decisions-needed.md` + `docs/plan-phase3/00-decisions-needed.md`
- ADR: `docs/adr/ADR-001`, `ADR-002`
- C-MET 1~17 매핑: `docs/plan-phase3/09-acceptance-gates.md` §6
- 리스크/롤백: `docs/plan-phase3/10-risks-and-rollback.md`

---

## 3. 재검증 (HANDOFF.md 의 Meta 와 비교)

다음을 **반드시 실행**해 스냅샷의 신선도를 확인한다:

```bash
git status --short
git log --oneline -5
git rev-parse HEAD
git rev-list --left-right --count origin/main...HEAD
pnpm typecheck 2>&1 | tail -3
pnpm test 2>&1 | tail -6
grep -riE '\b(webhook|delivery|fastify|receiver|_demo|Payload)\b' packages/core/src/
```

기대치(HANDOFF.md `## Meta` / `## Status Overview` 와 비교):

- `git rev-parse HEAD` == HANDOFF.md 의 `At commit` SHA
- left-right count == HANDOFF.md 의 `Sync`
- typecheck == HANDOFF.md
- test 통과 수 == HANDOFF.md
- core boundary grep hit 수 == HANDOFF.md (보통 0)

**불일치 케이스 처리:**

- **HEAD SHA 가 다름** → HANDOFF.md 가 stale. 새 세션이지만 사용자가 직전에 `/save-state` 없이 다른 작업을 했을 가능성. **사용자에게 알리고** "`/save-state` 로 갱신하시겠습니까?" 제안. 그동안은 git log/PLAN 본문을 1차 출처로 사용.
- **test 카운트가 다름** → 신규 테스트가 commit 되었거나 회귀. git log 로 변동 commit 추정 후 보고.
- **core boundary hit > 0** → 즉시 중단·보고. 1~2단계 보장 회귀(I2.7).

---

## 4. 작업에 적용할 패턴 (본 저장소에서 확립된 규약)

본 세션이 이 패턴을 따른다는 전제로 사용자가 `/resume` 을 호출했다고 간주한다.

1. **PRD → PLAN → 구현** 순서. 각 단계 끝에 commit + push.
2. **결정은 사용자에게.** 트레이드오프가 있으면 `AskUserQuestion` 으로 묻는다. 임의 결정 금지(CLAUDE.md §7-4).
3. **마일스톤 = 에이전트 디스패치 단위.** 본 저장소는 `general-purpose` 서브에이전트에 마일스톤 PLAN 본문을 그대로 옮긴 브리프로 위임하는 패턴.
4. **각 PLAN 단계 = 1 commit.** PLAN 의 conventional commits prefix(`feat`/`fix`/`chore`/`test`/`docs`/`refactor`) 그대로 사용. trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
5. **Trust but verify.** 에이전트 보고 후 항상 `git log` / `pnpm test` / grep 직접 검증.
6. **빈 commit 금지** (CLAUDE.md §6). 변경 없는 단계는 스킵 + 보고에 기재.
7. **amend 금지** — 회귀 발견 시 새 commit 으로 수정.
8. **건드리지 말 것:** `CLAUDE.md`, `.gitignore`(unstaged 그대로), `mise.toml`, `packages/streams-internals/` (부록 트랙 격리).
9. **건드리지 말 것 (마일스톤별):** 본 마일스톤 범위 외 영역. PLAN 의 "절대 만들지 않는 것" 목록 준수.
10. **PRD/PLAN/architecture/README 수정은 신중히** — 각 마일스톤 PLAN 의 §10 "C-MET 적용 시점" 또는 본 마일스톤에서 명시 허용된 위치만.

---

## 5. 첫 응답 형식 (사용자에게 보낼 것)

§3 검증 후 200~400자 이내로:

1. **상태 한 줄** — HANDOFF.md 의 head SHA + 동기 상태 + test 카운트. 불일치 있으면 함께 표시.
2. **현재 위치** — HANDOFF.md `## Track 진행도` 의 마지막 ✅ 항목까지 명시.
3. **사용자 결정 대기 항목** — HANDOFF.md `## ⚠️ 사용자 결정 대기 항목` 의 항목을 그대로 인용. 없으면 "없음".
4. **다음 작업 제안** — HANDOFF.md `## 다음 작업 한 줄` 인용 + "진행할까요?" 식의 명시적 확인.

사용자가 다른 방향을 지시하지 않는 한 본 흐름을 따른다. **자동 디스패치 금지** — 다음 작업 진입은 사용자 명시 승인 후.

---

## 6. 작업이 끝나면

세션 종료 직전(또는 사용자가 `/clear` 를 예고할 때) **`/save-state`** 을 권장. 본 명령은 `.claude/state/HANDOFF.md` 를 갱신 + commit + push 해 다음 세션이 정확한 위치에서 재개할 수 있게 한다.

> `/save-state` 가 호출되지 않으면 HANDOFF.md 는 직전 스냅샷에 머무른다 — `/resume` 의 §3 재검증이 차이를 잡지만, 차이가 클수록 더 많은 추론이 필요해 비용이 증가한다.
