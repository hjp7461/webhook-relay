# PLAN `03` §4-17. 단순화 위해 빌드 산출물 대신 tsx 로 직접 실행.
# 베이스 결정 변동: PLAN 은 node:20-alpine 을 권장했으나, 본 저장소의 pnpm 11.3.0
# 은 Node 20 에서 import 실패(ERR_UNKNOWN_BUILTIN_MODULE)한다. CLAUDE.md §2 가
# 요구하는 "Node.js 20+ LTS" 범위 내에서 호환 가능한 22-alpine 으로 격상한다
# (Node 22 도 LTS). 본 변경은 보고서에 기재됨.
FROM node:22-alpine AS base

# pnpm 활성화(corepack).
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

WORKDIR /app

# 워크스페이스 메타. lockfile 까지 함께 복사해야 frozen install 이 가능.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/core/package.json packages/core/tsconfig.json packages/core/
COPY packages/demo/package.json packages/demo/tsconfig.json packages/demo/

# 의존성 설치. 개발 의존성도 포함해야 tsx 가 들어온다.
RUN pnpm install --frozen-lockfile

# 소스 복사.
COPY packages/core/src packages/core/src
COPY packages/demo/src packages/demo/src

ENV NODE_ENV=production
EXPOSE 3000

# tsx 로 직접 실행. 빌드 단계는 본 단계에서 생략.
CMD ["pnpm", "--filter", "@webhook-relay/demo", "exec", "tsx", "src/main.ts"]
