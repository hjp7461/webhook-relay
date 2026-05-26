import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from "fastify";

import {
  ALLOWED_METHODS,
  ROUTE_ENUM,
  STATUS_CLASS_2XX,
  STATUS_CLASS_3XX,
  STATUS_CLASS_4XX,
  STATUS_CLASS_5XX,
  type AllowedMethod,
  type RouteEnum,
  type StatusClass,
} from "../constants.js";
import {
  apiRequestDurationSeconds,
  apiRequestsTotal,
} from "../metrics.js";

// demo/api/metrics-plugin.ts
//
// Phase 3 PRD `prd-phase3/01` §3.2 D1/D2 wiring.
//
// 본 plugin 은 Fastify onRequest / onResponse hook 를 사용해 D1 (Counter) 과
// D2 (Histogram) 를 갱신한다. D3 (request body bytes) 는 별도 preHandler hook
// 에서 처리(body 가 있는 라우트 한정).
//
// 카디널리티 보호(Q-OBS-8 (a)):
// - route 라벨은 `ROUTE_ENUM` 7종에 한해 등록한다. 그 외 라우트(404 / 1~2단계
//   범위 외) 는 메트릭에 라벨 등록 자체를 skip.
// - method 라벨은 `ALLOWED_METHODS` (GET / POST) 한정.
// - status_class 는 응답 status code 를 2xx/3xx/4xx/5xx 4종으로 묶는다(Q-OBS-5).
//
// hot path 비차단(I3.5, I4.5):
// - 메트릭 갱신은 동기 호출(`inc()`, `observe()`)만 사용. await 없음.
// - timer 는 request 객체에 hidden 키로 stash → onResponse 에서 stop.

const ROUTE_ENUM_SET: ReadonlySet<RouteEnum> = new Set<RouteEnum>(ROUTE_ENUM);
const METHOD_SET: ReadonlySet<AllowedMethod> = new Set<AllowedMethod>(
  ALLOWED_METHODS,
);

// Fastify request 객체에 timer 와 매칭된 route 를 stash 하기 위한 symbol.
const METRICS_CTX = Symbol("metricsCtx");

interface MetricsCtx {
  readonly startNs: bigint;
  readonly route: RouteEnum | undefined;
  readonly method: AllowedMethod | undefined;
}

interface RequestWithMetricsCtx extends FastifyRequest {
  [METRICS_CTX]?: MetricsCtx;
}

/**
 * Fastify routeOptions.url 을 ROUTE_ENUM 에 매핑.
 *
 * 본 PRD 범위에서는 동적 path parameter 가 없으므로 정확 일치만 허용한다.
 * 향후 동적 path 가 등장하면(`/jobs/:id` 등) generic 패턴으로 매핑하는 helper
 * 를 추가하되, enum 외 값은 라벨로 등록하지 않는다(Q-OBS-8 (a)).
 */
function matchRouteEnum(url: string | undefined): RouteEnum | undefined {
  if (typeof url !== "string") return undefined;
  if (ROUTE_ENUM_SET.has(url as RouteEnum)) return url as RouteEnum;
  return undefined;
}

function matchMethod(method: string | undefined): AllowedMethod | undefined {
  if (typeof method !== "string") return undefined;
  const upper = method.toUpperCase();
  if (METHOD_SET.has(upper as AllowedMethod)) return upper as AllowedMethod;
  return undefined;
}

function classifyStatus(status: number): StatusClass | undefined {
  if (status >= 200 && status < 300) return STATUS_CLASS_2XX;
  if (status >= 300 && status < 400) return STATUS_CLASS_3XX;
  if (status >= 400 && status < 500) return STATUS_CLASS_4XX;
  if (status >= 500 && status < 600) return STATUS_CLASS_5XX;
  return undefined;
}

/**
 * Fastify plugin 형태의 D1/D2 wiring. 라우트 등록 이전에 본 함수를 호출해야
 * onRequest hook 가 모든 라우트에 적용된다(server.ts 부트스트랩이 책임진다).
 */
export async function registerApiMetricsPlugin(
  app: FastifyInstance,
): Promise<void> {
  app.addHook(
    "onRequest",
    (req: FastifyRequest, _reply: FastifyReply, done: HookHandlerDoneFunction): void => {
      // Fastify v5 의 `req.routeOptions.url` 가 정의된 라우트 url 패턴.
      // 본 hook 가 onRequest 단계에서 호출될 때는 라우트 매칭이 이미 완료된 상태.
      const url = req.routeOptions?.url;
      const route = matchRouteEnum(url);
      const method = matchMethod(req.method);
      // process.hrtime.bigint() 는 ns 단위 단조 증가 — wall-clock 영향 없음.
      const startNs = process.hrtime.bigint();
      (req as RequestWithMetricsCtx)[METRICS_CTX] = {
        startNs,
        route,
        method,
      };
      done();
    },
  );

  app.addHook(
    "onResponse",
    (req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void => {
      const ctx = (req as RequestWithMetricsCtx)[METRICS_CTX];
      if (ctx === undefined) {
        done();
        return;
      }
      const { route, method } = ctx;
      // route/method enum 매칭 실패 시 카디널리티 보호를 위해 라벨 등록 skip.
      if (route === undefined || method === undefined) {
        done();
        return;
      }
      const status = reply.statusCode;
      const statusClass = classifyStatus(status);
      if (statusClass === undefined) {
        done();
        return;
      }
      const elapsedSec = Number(process.hrtime.bigint() - ctx.startNs) / 1e9;

      // D1 — counter +1.
      apiRequestsTotal.inc({
        route,
        method,
        status_class: statusClass,
      });
      // D2 — histogram observe(seconds).
      apiRequestDurationSeconds.observe(
        { route, method, status_class: statusClass },
        elapsedSec,
      );
      done();
    },
  );
}
