import { defineConfig } from "vitest/config";

// 본 설정은 단일 진입(루트 vitest.config.ts) + 이름이 부여된 projects 로
// 단위/통합을 분리한다. PLAN §4-6 의 단순함 우선 원칙을 따른다.
// - unit:        *.unit.test.ts        (Redis 의존성 없음, 빠름)
// - integration: *.integration.test.ts (실제 Redis 또는 파일시스템 등 외부 상태)
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/test/**/*.unit.test.ts", "packages/*/src/**/*.unit.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: [
            "packages/*/test/**/*.integration.test.ts",
            "packages/*/src/**/*.integration.test.ts",
          ],
        },
      },
    ],
  },
});
