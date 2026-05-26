import { GenericContainer, type StartedTestContainer } from "testcontainers";

// Testcontainers 로 Redis 7-alpine 컨테이너를 띄우는 헬퍼.
//
// 모든 통합 테스트가 재사용한다(PRD `03` §6). ioredis-mock 같은 모킹 라이브러리
// 는 사용하지 않는다.

export interface StartedRedis {
  readonly container: StartedTestContainer;
  readonly url: string;
  stop(): Promise<void>;
}

export async function startRedisContainer(): Promise<StartedRedis> {
  const container = await new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379)
    .withStartupTimeout(60_000)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(6379);
  const url = `redis://${host}:${port}`;

  return {
    container,
    url,
    async stop(): Promise<void> {
      await container.stop({ timeout: 10_000 });
    },
  };
}
