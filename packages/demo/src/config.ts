import { z } from "zod";
import {
  DEFAULT_WEBHOOK_HMAC_HEADER,
  DLQ_NAME,
  QUEUE_NAME,
} from "./constants.js";

// demo/config.ts
//
// 환경변수의 단일 출처(PRD `05` §8). `core` 는 환경변수를 직접 읽지 않고
// 본 모듈이 파싱한 결과를 받는다(I5.2).
//
// 결정 잠금:
// - Q-API-1 (b) — API_BEARER_TOKEN 필수, 최소 32 bytes.
// - Q-SEC-3 (a) — 모든 시크릿 32 bytes 최소.
// - Q-SEC-1 (b) — ALLOW_PRIVATE_TARGETS env, 기본 true (데모 동작 보장).
// - Q-SEC-5 (a) — /healthz degraded = 503. (구현 측 의존)
//
// fail-fast 원칙: 시크릿 누락/짧음 → 부트스트랩 즉시 종료. 에러 메시지에
// 시크릿 값은 등장하지 않는다(AC5.4, AC6.2).

const MIN_SECRET_BYTES = 32;

// 문자열 → boolean 강제(true/false 만 허용). 다른 값은 거부.
const booleanFromString = z
  .union([z.literal("true"), z.literal("false")])
  .transform((v) => v === "true");

// 문자열 → 정수 강제. 음수/0 도 후속 refine 으로 차단.
const positiveIntFromString = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer string")
  .transform((v) => Number.parseInt(v, 10))
  .refine((n) => Number.isInteger(n) && n > 0, {
    message: "must be a positive integer",
  });

// PORT 전용 강제. 0 을 허용한다(OS 자동 포트 할당; IT-S7/in-process fixture
// 가 자식 프로세스에 PORT=0 을 그대로 전달할 수 있도록). 상한은 65535.
const portIntFromString = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer string")
  .transform((v) => Number.parseInt(v, 10))
  .refine((n) => Number.isInteger(n) && n >= 0 && n <= 65535, {
    message: "must be an integer in [0, 65535]",
  });

// LOG_LEVEL 허용값(pino 표준).
const LogLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace"]);

// SERVICE_MODE 허용값.
// - 'all'    — 단일 프로세스에 API + Worker 동거(데모 기본값, IT-S7 자식 호환).
// - 'api'    — Fastify HTTP 만 실행(워커 미생성). 운영 분리 컨테이너용.
// - 'worker' — BullMQ Worker 만 실행(HTTP 미생성). `docker compose --scale worker=N`.
const ServiceModeSchema = z.enum(["all", "api", "worker"]);

const ConfigEnvSchema = z.object({
  // 1단계 키 (M2)
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  // PORT 는 0 을 허용한다(OS 가 빈 포트 할당; 자식 프로세스에 PORT=0 그대로 전달
  // 가능). 기본 3000 유지.
  PORT: portIntFromString
    .default(3000 as unknown as never)
    .or(z.number().int().min(0).max(65535)),
  LOG_LEVEL: LogLevelSchema.default("info"),
  WEBHOOK_MAX_PAYLOAD_BYTES: positiveIntFromString
    .default(65536 as unknown as never)
    .or(z.number().int().positive()),
  WEBHOOK_DELIVERY_TIMEOUT_MS: positiveIntFromString
    .default(5000 as unknown as never)
    .or(z.number().int().positive()),
  QUEUE_NAME: z.string().min(1).default(QUEUE_NAME),
  REDIS_RECONNECT_BASE_MS: positiveIntFromString
    .default(200 as unknown as never)
    .or(z.number().int().positive()),
  REDIS_RECONNECT_MAX_MS: positiveIntFromString
    .default(10000 as unknown as never)
    .or(z.number().int().positive()),
  WORKER_CONCURRENCY: positiveIntFromString
    .default(5 as unknown as never)
    .or(z.number().int().positive()),
  // 결정 잠금 Q-SEC-1 (b): 기본 true.
  ALLOW_PRIVATE_TARGETS: booleanFromString.default(true as unknown as never).or(z.boolean()),

  // 결정 잠금 Q-API-1 (b): API_BEARER_TOKEN 필수, 32 bytes 이상.
  API_BEARER_TOKEN: z
    .string({ message: "API_BEARER_TOKEN is required" })
    .min(MIN_SECRET_BYTES, `API_BEARER_TOKEN must be at least ${MIN_SECRET_BYTES} bytes`),

  // 2단계 키 (M3+) — 스키마에는 정의하되 본 M2 에서 검증/사용은 제한적.
  WEBHOOK_MAX_ATTEMPTS: positiveIntFromString
    .default(5 as unknown as never)
    .or(z.number().int().positive()),
  WEBHOOK_BACKOFF_BASE_MS: positiveIntFromString
    .default(1000 as unknown as never)
    .or(z.number().int().positive()),
  // 결정 잠금 Q-SEC-3 (a): 32 bytes 이상. 부재 거부.
  WEBHOOK_HMAC_SECRET: z
    .string({ message: "WEBHOOK_HMAC_SECRET is required" })
    .min(MIN_SECRET_BYTES, `WEBHOOK_HMAC_SECRET must be at least ${MIN_SECRET_BYTES} bytes`),
  WEBHOOK_HMAC_HEADER: z.string().min(1).default(DEFAULT_WEBHOOK_HMAC_HEADER),
  DLQ_NAME: z.string().min(1).default(DLQ_NAME),
  STALLED_INTERVAL_MS: positiveIntFromString
    .default(30000 as unknown as never)
    .or(z.number().int().positive()),
  MAX_STALLED_COUNT: positiveIntFromString
    .default(1 as unknown as never)
    .or(z.number().int().positive()),
  SHUTDOWN_TIMEOUT_MS: positiveIntFromString
    .default(30000 as unknown as never)
    .or(z.number().int().positive()),

  // 서비스 모드(api/worker 프로세스 분리). 기본값 'all' 은 단일 프로세스로
  // 동작하므로 기존 데모 흐름(IT-S7 자식 프로세스 포함)을 회귀시키지 않는다.
  SERVICE_MODE: ServiceModeSchema.default("all"),

  // Q-OBS-3 (a) — SERVICE_MODE=worker 컨테이너도 최소 Fastify HTTP 서버를
  // 띄워 `/metrics` 만 노출한다. 0 허용(테스트에서 OS 가 빈 포트 할당).
  WORKER_METRICS_PORT: portIntFromString
    .default(3001 as unknown as never)
    .or(z.number().int().min(0).max(65535)),
});

export type AppConfig = z.infer<typeof ConfigEnvSchema>;

// 시크릿 값 자체는 에러 메시지에 등장해선 안 된다(I6.1, AC6.2).
// Zod 가 기본적으로 input 값을 메시지에 포함하는 케이스가 있어, 본 함수는
// 시크릿 키를 검사할 때 안전 메시지로 치환한다.
const SECRET_KEYS = new Set<string>(["API_BEARER_TOKEN", "WEBHOOK_HMAC_SECRET"]);

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

/**
 * 환경변수 객체를 파싱한다. process.env 에 의존하지 않고 명시적 인자만 받는다
 * (테스트 결정성). 실패 시 ConfigValidationError 를 던지며 시크릿 값은
 * 메시지에 포함되지 않는다.
 */
export function parseConfig(env: Record<string, string | undefined>): AppConfig {
  // undefined 키는 제거(Zod default 적용을 위해).
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) cleaned[k] = v;
  }
  const result = ConfigEnvSchema.safeParse(cleaned);
  if (result.success) return result.data;

  // 시크릿 키의 issue 메시지에서 input 값이 새지 않도록 안전 메시지로 통일.
  const issues = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    if (SECRET_KEYS.has(path)) {
      return `${path}: invalid (value omitted)`;
    }
    return `${path}: ${issue.message}`;
  });
  throw new ConfigValidationError(
    `Invalid configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`,
  );
}

/**
 * process.env 로부터 파싱(부트스트랩 진입점). 실패 시 명확한 stderr 메시지와
 * 함께 즉시 종료. 시크릿 값은 출력에 등장하지 않는다.
 */
export function loadConfigFromProcessEnv(): AppConfig {
  try {
    return parseConfig(process.env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[config] ${msg}\n`);
    process.exit(1);
  }
}
