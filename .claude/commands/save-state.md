---
description: 현재 작업 상태를 .claude/state/HANDOFF.md 에 스냅샷하고 commit + push. /clear 직전에 호출.
---

# 📸 Checkpoint — webhook-relay 상태 스냅샷

당신은 **현재 세션의 작업 상태**를 `.claude/state/HANDOFF.md` 에 스냅샷하라는 명령을 받았다. 다음을 정확히 수행한다.

---

## 1. 사실 수집 (모두 직접 실행)

병렬 가능한 명령은 한 메시지에서 동시에 실행한다.

```bash
# 동기/위치
git status --short
git log --oneline -10
git rev-list --left-right --count origin/main...HEAD
git rev-parse HEAD

# 검증
pnpm typecheck 2>&1 | tail -3
pnpm test 2>&1 | tail -6

# 경계
grep -riE '\b(webhook|delivery|fastify|receiver|_demo|Payload)\b' packages/core/src/
```

병렬 호출 후 다음을 결정:
- 마지막 commit SHA (`git rev-parse HEAD` 결과)
- 동기화 상태 (left-right count)
- 워킹 트리 cleanliness (`git status --short`)
- typecheck 통과 여부
- 테스트 파일 수 + 통과 수 + unhandled errors 수
- core 경계 hit 수 (0이어야 정상)

---

## 2. 진행도 판정

병렬로 다음을 읽어 진행도를 결정:

- `README.md` 로드맵 섹션 — 트랙별 ✅/⏳/🟡
- `docs/plan/01-milestones.md` — 1~2단계 M1~M7 완료 여부
- `docs/plan-phase3/01-milestones.md` — M-OBS-1~6 완료 여부
- `docs/plan-phase3/01-milestones.md` 의 unchecked 첫 항목 = **다음 작업**

마일스톤 완료 판정 휴리스틱: 해당 마일스톤 PLAN(예: `02-m-obs-1-bootstrap.md`) 의 §4 commit 메시지 prefix 가 git log 에 등장하는지 + 마일스톤 PLAN 의 수용 기준이 충족됐는지(typecheck/test 그린).

---

## 3. 결정 대기 항목 수집

`docs/plan/00-decisions-needed.md` 와 `docs/plan-phase3/00-decisions-needed.md` 에서 `Status: Open` 항목을 검색. 있으면 모두 나열 — 새 세션이 이 항목 위에서 작업을 진행할 수 없으므로.

또한 마일스톤별 PLAN 본문이나 직전 commit 메시지에서 "사용자 결정 위임" / "별도 PR" / "C-MET-*" 로 표시된 미해결 항목도 합류.

---

## 4. `.claude/state/HANDOFF.md` 갱신

다음 템플릿을 그대로 사용. 빈 자리는 §1~§3 사실로 채운다. 기존 `Notes` 섹션의 메모는 **누적 보존**하되 명백히 해결된(다음 작업으로 넘어간) 항목은 정리.

```markdown
# Handoff Snapshot

> **자동 생성/갱신 파일.** `/save-state` 명령이 갱신하고, `/load-state` 명령이 읽는다.
> 본 파일은 **시점 스냅샷**이지 단일 출처가 아니다. 새 세션은 항상 본 파일을 1차 컨텍스트로 받되, **git/PLAN/테스트로 재검증**한 뒤 작업을 시작한다.

---

## Meta

- **Last updated:** <YYYY-MM-DD>
- **At commit:** `<SHA>`
- **Branch:** `<branch-name>`
- **Sync:** <origin sync 상태>
- **Working tree:** <clean | unstaged 항목 요약>

---

## Status Overview

- **typecheck:** <✅ 0 errors | ❌ N errors>
- **tests:** <✅ N files / M passed | ❌ ...>
- **core boundary grep:** <✅ 0 hits | ⚠️ N hits>
- **CI workflow:** `.github/workflows/test.yml` (unit + integration 분리)
- **누적 commit:** `a035dce`(초기) 이후 N+ commits

---

## Track 진행도

| 트랙 | 상태 | 비고 |
| ... 1~2단계, 후속 정산, API/Worker 분리, 3단계, 4단계, 부록 ... |

---

## 3단계 마일스톤 진행도 (해당 단계 진행 중일 때만)

| ID | 이름 | 상태 | 핵심 |
| ... M-OBS-1 ~ M-OBS-6 ... |

PLAN 본문: `docs/plan-phase3/0X-...md` ~ `0Y-...md`.

---

## ⚠️ 사용자 결정 대기 항목

<§3 결과를 그대로. 항목별로 선택지 명시. 없으면 "없음" 한 줄.>

---

## 다음 작업 한 줄

**<M-OBS-N 이름>** — `docs/plan-phase3/0X-...md` 정독 → <첫 단계 한 줄>.

---

## Recent commits (head → 5개)

\`\`\`
<git log --oneline -5 결과>
\`\`\`

전체 이력은 `git log --oneline -30` 으로 확인.

---

## Notes (자유 메모, /save-state 시 누적/정리)

- <보존할 메모 + 새로 추가할 메모>
```

---

## 5. Commit + Push

`.claude/state/HANDOFF.md` 변경만 staging.

```bash
git add .claude/state/HANDOFF.md
git status --short  # HANDOFF.md만 staged인지 확인. 다른 파일이 함께 잡혔다면 즉시 중단·보고.
```

다른 변경이 함께 잡혔다면 사용자에게 보고한 뒤 진행 결정. 같이 commit 하지 말 것.

commit 메시지 (HEREDOC):

```
chore(handoff): snapshot at <SHA-short> — <다음 작업 한 줄 요약>

<Track 진행도의 가장 최근 변경 요점 1~2줄>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

push:

```bash
git push origin main
```

push 실패 시 즉시 중단·보고. force push 절대 금지.

---

## 6. 사용자 보고

200자 이내로 보고:

1. 마지막 commit SHA + 동기 상태(`ahead/behind`)
2. typecheck/test 그린 여부
3. 다음 작업 한 줄(HANDOFF.md `## 다음 작업 한 줄` 그대로)
4. 결정 대기 항목 수(있으면 ID 나열)

보고 후 추가 지시 대기. 자동 진행 금지.
