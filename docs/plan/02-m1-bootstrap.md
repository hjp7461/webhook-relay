# 02. M1 — Bootstrap

> **PLAN 진입 조건:** 본 묶음(`docs/plan/`)이 승인되고, `00-decisions-needed.md` §3 매트릭스 M1 행의 Q가 모두 Resolved여야 한다.
>
> **AI 협업 5원칙 적용:** 본 마일스톤은 PRD 어떤 도메인 코드도 작성하지 않는다(원칙 3). 사람이 결정한 도구 체인을 그대로 옮겨 적는 단계다.

## 1. 목표 한 줄

모노레포 도구 체인(pnpm workspace, TS strict, Vitest, Testcontainers 사용 준비, docker-compose 골격)을 갖추되, **도메인 코드는 작성하지 않는다.** 빈 테스트가 그린이고, 도메인 경계 회귀 테스트가 도입된 상태로 종료한다.

## 2. 선행 의존

- **마일스톤:** 없음.
- **결정 필요 항목:**
  - Q-ARCH-2 — 도메인 경계 검증 수단 (권장 (c) 통합 테스트)
  - Q-ARCH-3 — `core/metrics.ts` 범위 (권장 (a) 빈 파일/타입 인터페이스만)

## 3. 테스트 우선 시퀀스

본 마일스톤은 "구현 전 실패 테스트"가 시나리오 7건과 직접 대응하지는 않는다. 단, **`IT-R1-domain-boundary` 회귀 테스트는 본 마일스톤에서 도입한다**(빈 패키지에서도 의미 있음: 향후 `webhook`이 `core/`로 흘러들면 즉시 실패).

1. **(테스트)** `IT-R1-domain-boundary` — `packages/core/src/**` 파일들의 텍스트에 도메인 식별자(`webhook`, `http`, `fastify`, `Payload`(case-insensitive), `URL`(외부 라이브러리 타입 명시 외에는 금지)) 가 등장하지 않는지 검증한다. 통합 테스트(파일시스템 스캔)로 작성한다. 처음에는 패키지가 비어 있으므로 그린이지만, 가드의 존재 자체가 본 마일스톤의 산출물이다.

> 본 PRD `03` §3 추가 항목 `IT-R1-domain-boundary`와 ID가 일치한다.

## 4. 구현 단계 (커밋 단위)

각 번호는 한 커밋에 적합한 크기다. 각 커밋 메시지 앞부분에 Conventional Commits 접두어를 붙인다.

1. **`chore: add pnpm workspace and root package.json`**
   - 루트 `package.json` 작성 (private, workspaces).
   - `pnpm-workspace.yaml` 작성.
   - `.nvmrc` 또는 `engines` 필드로 Node 20+ LTS 고정.

2. **`chore: add root tsconfig and shared compiler options`**
   - 루트 `tsconfig.base.json`에 `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `target: ES2022`, `moduleResolution: NodeNext`, `module: NodeNext`, `verbatimModuleSyntax`(권장) 설정.
   - 루트 `tsconfig.json`은 `references`로 두 패키지 가리키게 한다.

3. **`chore: scaffold packages/core skeleton`**
   - `packages/core/package.json` (private, `name: "@webhook-relay/core"`, `type: "module"`).
   - `packages/core/tsconfig.json`은 `tsconfig.base.json`을 extends.
   - 빈 `src/queue.ts`, `src/producer.ts`, `src/worker.ts`, `src/retry.ts`, `src/shutdown.ts`, `src/errors.ts`, `src/metrics.ts` — 각 파일은 **빈 export** 또는 TODO 주석만 둔다. Q-ARCH-3 권장 (a)에 따라 `metrics.ts`는 빈 인터페이스만.
   - `src/index.ts` 배럴은 본 단계에서 둘지 PLAN 단계 결정 — 권장: 두지 않음(YAGNI).

4. **`chore: scaffold packages/demo skeleton`**
   - `packages/demo/package.json` (private, `name: "@webhook-relay/demo"`, `dependsOn` core via workspace protocol).
   - 빈 `src/api/`, `src/handlers/`, `src/receiver/`, `src/domain/`, `src/config.ts`(빈 export), `src/constants.ts`(빈 export), `src/chaos.ts`(빈 export).
   - 진입점 `src/server.ts`는 본 단계에서 **만들지 않는다**(M2에서 처음 등장).

5. **`chore: reserve packages/streams-internals placeholder`**
   - `packages/streams-internals/.gitkeep`만 둔다.
   - 어떤 코드도 두지 않는다. README는 만들지 않는다(부록 트랙 보호 — CLAUDE.md §1, PRD `07` §1.3).

6. **`chore: add vitest config and split unit/integration runs`**
   - 루트 `vitest.config.ts`는 `projects` 또는 `workspace` 모드로 두 패키지의 테스트를 포괄.
   - `*.unit.test.ts`와 `*.integration.test.ts`를 파일명 패턴으로 분리. 단위는 기본 실행, 통합은 별도 스크립트.
   - 새 의존성: `vitest`, `@vitest/coverage-*`는 본 단계에서 도입하지 않음(커버리지는 본 PRD 범위 외).

7. **`chore: add test scripts in root package.json`**
   - `test`, `test:unit`, `test:integration`, `typecheck`, `build`(stub).
   - README의 "테스트" 섹션 명령과 일치시킨다.

8. **`test: add IT-R1 domain boundary scan`**
   - `packages/core/test/it-r1-domain-boundary.integration.test.ts` 작성.
   - `packages/core/src/**/*.ts`를 스캔해 금지 토큰(`webhook`, `fastify`, `http`(`https` 제외 정책 PRD `02`와 일치), `Payload`(데이터 식별자), `_demo`)이 등장하지 않는지 검증.
   - 본 테스트는 **통합 테스트로 분류**(파일시스템 액세스). 단, Redis 의존성은 없다. 명세상 `IT-R1`이 회귀 보호 용도이며 단위·통합 어느 쪽에 두어도 가능하나, 단위 정의("순수 로직")보다 통합("외부 상태 액세스") 정의에 더 맞다는 판단.
   - 처음 작성 시점에 그린(`core/` 패키지가 비어 있으므로). 가드의 존재 자체가 본 마일스톤 산출물.
   - **주의:** 본 테스트가 `URL` 같은 표준 타입을 잘못 잡지 않도록, 검사 토큰 목록을 정확히 한정한다(테스트 코드 안의 `BANNED_TOKENS` 배열에 명시).

9. **`chore: add docker-compose skeleton`**
   - 루트 `docker-compose.yml`에 `redis` 서비스 1개만 정의. 앱 서비스(`api`, `worker`)는 본 단계에서 정의하지 않는다(M2가 등장 시점).
   - `docker/prometheus.yml`, `docker/grafana/`는 자리만 예약(빈 파일 또는 `.gitkeep`) — 3단계 PRD 범위.

10. **`chore: add .env.example`**
    - PRD `05` §8의 환경변수 키를 모두 키만 적고, 시크릿은 빈 값.
    - 본 단계에서 실제 코드는 이 파일을 읽지 않지만, 다음 마일스톤이 사용한다.

11. **`docs: link PLAN docs from README`** (선택)
    - README 로드맵 절 옆에 `docs/plan/`로의 링크 한 줄 추가. **README 본문은 수정하지 않는다.** 본 PLAN 산출물 외 PRD/README는 손대지 않는 정책상, 이 단계는 PLAN 범위 밖이며 사람이 직접 결정한다. → **본 PLAN에서는 이 단계를 생략**.

> **단계 10 이후 회귀 점검:** `pnpm install && pnpm typecheck && pnpm test`가 그린.

## 5. 생성/수정할 파일 목록 (절대경로)

- `/Users/connor/biz/webhook-relay/package.json` (생성)
- `/Users/connor/biz/webhook-relay/pnpm-workspace.yaml` (생성)
- `/Users/connor/biz/webhook-relay/.nvmrc` (생성)
- `/Users/connor/biz/webhook-relay/tsconfig.json` (생성)
- `/Users/connor/biz/webhook-relay/tsconfig.base.json` (생성)
- `/Users/connor/biz/webhook-relay/vitest.config.ts` (생성)
- `/Users/connor/biz/webhook-relay/docker-compose.yml` (이미 존재, 빈 파일을 채움)
- `/Users/connor/biz/webhook-relay/.env.example` (생성)
- `/Users/connor/biz/webhook-relay/packages/core/package.json` (생성)
- `/Users/connor/biz/webhook-relay/packages/core/tsconfig.json` (생성)
- `/Users/connor/biz/webhook-relay/packages/core/src/queue.ts` (생성, 빈 export)
- `/Users/connor/biz/webhook-relay/packages/core/src/producer.ts` (생성, 빈 export)
- `/Users/connor/biz/webhook-relay/packages/core/src/worker.ts` (생성, 빈 export)
- `/Users/connor/biz/webhook-relay/packages/core/src/retry.ts` (생성, 빈 export)
- `/Users/connor/biz/webhook-relay/packages/core/src/shutdown.ts` (생성, 빈 export)
- `/Users/connor/biz/webhook-relay/packages/core/src/errors.ts` (생성, 빈 export)
- `/Users/connor/biz/webhook-relay/packages/core/src/metrics.ts` (생성, 빈 export — Q-ARCH-3 (a))
- `/Users/connor/biz/webhook-relay/packages/core/test/it-r1-domain-boundary.integration.test.ts` (생성)
- `/Users/connor/biz/webhook-relay/packages/demo/package.json` (생성)
- `/Users/connor/biz/webhook-relay/packages/demo/tsconfig.json` (생성)
- `/Users/connor/biz/webhook-relay/packages/demo/src/api/.gitkeep` (생성)
- `/Users/connor/biz/webhook-relay/packages/demo/src/handlers/.gitkeep` (생성)
- `/Users/connor/biz/webhook-relay/packages/demo/src/receiver/.gitkeep` (생성)
- `/Users/connor/biz/webhook-relay/packages/demo/src/domain/.gitkeep` (생성)
- `/Users/connor/biz/webhook-relay/packages/demo/src/config.ts` (생성, 빈 export)
- `/Users/connor/biz/webhook-relay/packages/demo/src/constants.ts` (생성, 빈 export)
- `/Users/connor/biz/webhook-relay/packages/demo/src/chaos.ts` (생성, 빈 export)
- `/Users/connor/biz/webhook-relay/packages/streams-internals/.gitkeep` (생성)
- `/Users/connor/biz/webhook-relay/docker/prometheus.yml` (생성, 자리만 — 3단계 placeholder)
- `/Users/connor/biz/webhook-relay/docker/grafana/.gitkeep` (생성, 3단계 placeholder)

> **본 마일스톤에서 절대 만들지 않는 것:** 어떤 형태의 `server.ts`, Fastify import, BullMQ import, 도메인 식별자가 들어간 파일/스키마.

## 6. 새 의존성 도입 (CLAUDE.md §2 준수 확인)

본 마일스톤은 다음 의존성만 추가한다. 모두 CLAUDE.md §2 고정 스택과 일치:

- 루트(devDependencies): `typescript`, `vitest`, `tsx`(선택, 실행용. M2 진입 시 결정 가능 — 본 PLAN은 vitest 기본 트랜스파일만으로 진행 권장).
- `core`/`demo`(devDependencies): `typescript` (workspace에서 호이스트되면 생략).
- **본 마일스톤에서 추가 의존성 도입 금지 목록:** `bullmq`, `ioredis`, `fastify`, `zod`, `prom-client`, `@testcontainers/redis`. 모두 M2 이후 해당 모듈을 처음 사용하는 마일스톤에서 도입한다(정당성을 그 커밋 메시지에 명시).

> **이유:** 사용처 없는 의존성을 미리 추가하면 PRD `06`의 시크릿 fail-fast나 PRD `07-Q-ARCH-3`의 보수적 정책과 충돌한다. 의존성은 "필요할 때" 추가한다.

## 7. 수용 기준 / Done 정의

- [x] `pnpm install`이 0 에러로 종료한다.
- [x] `pnpm typecheck`(모든 패키지)가 0 에러로 종료한다.
- [x] `pnpm test`가 통과한다(테스트 1건 = `IT-R1-domain-boundary`가 그린).
- [x] `pnpm test:unit`과 `pnpm test:integration`이 각각 독립 실행 가능하다(필요 시 한쪽이 0건이어도 OK).
- [x] `docker compose config`가 유효하다(`redis` 서비스만 존재).
- [x] `packages/streams-internals/`에 코드/문서가 추가되지 않았다(부록 트랙 격리, AC4.4).
- [x] `.env.example`이 PRD `05` §8 환경변수 키를 모두 포함한다(값은 비어 있어도 됨).
- [x] 자체 grep: `packages/core/src/**`에 도메인 식별자가 0개다.

## 8. PRD 역참조

- PRD `04-architecture-boundaries.md` §4 폴더 구조 — 본 마일스톤이 그 폴더 구조를 그대로 만든다.
- PRD `04` §7-A 구현 규약 — 본 마일스톤이 tsconfig/lint 토대를 마련.
- PRD `03-test-strategy.md` §3 `IT-R1-domain-boundary` — 본 마일스톤에서 도입.
- PRD `05` §8 환경변수 — `.env.example`에 키만 등장.
- CLAUDE.md §2 기술 스택 — 본 마일스톤이 이를 준수하는 의존성 토대를 마련.

## 9. 오픈 퀘스천 의존

- **Q-ARCH-2** — 의존 방향 검증 수단 결정. 본 PLAN의 권장은 (c) 통합 테스트(`IT-R1-domain-boundary`). 결정이 다른 옵션으로 잠기면 §3과 §4의 단계 8을 재작성한다.
- **Q-ARCH-3** — `core/metrics.ts` 범위 결정. 본 PLAN의 권장은 (a) 빈 파일. 다른 옵션으로 잠기면 §4 단계 3을 재작성한다.

> 본 마일스톤은 위 2건 외에 결정 의존이 없다. 21건 중 나머지 19건은 M2 이후에서 잠기면 충분.

## 10. PRD 변경 제안

- (없음) — PRD가 폴더 구조를 충분히 정의했으며, 본 마일스톤은 그것을 그대로 옮겨 적는다.

## 11. 회귀 점검

- 본 마일스톤이 끝나는 시점:
  - `pnpm test` 1회 — 그린
  - `pnpm typecheck` 1회 — 그린
- 본 마일스톤에서 도입한 `IT-R1-domain-boundary`는 이후 모든 마일스톤에서 그린을 유지해야 한다.

## 12. 본 마일스톤 후 데모 상태

- 데모는 아직 동작하지 않는다(서버 없음). **이는 본 마일스톤의 의도된 종료 상태**다.
- "데모 동작 가능 상태"의 기준은 M2 이후부터 적용된다. M1의 "동작 가능 상태"는 **빌드/테스트 그린**으로 정의한다(CLAUDE.md §6 해석).
