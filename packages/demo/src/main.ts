import { main } from "./server.js";

// 프로세스 진입점. `tsx packages/demo/src/main.ts` 로 직접 실행.

main().catch((err) => {
  // 부트스트랩 실패는 stderr 로 남기고 종료. 시크릿 값은 등장하지 않는다
  // (config.ts 가 안전 메시지로 치환).
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[bootstrap] ${msg}\n`);
  process.exit(1);
});
