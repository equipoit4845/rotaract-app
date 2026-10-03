import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import {
  appIdentity,
  buildEntry,
  resolveTraceId,
  type AppRequestMarks,
  type ProblemMark,
} from "../../application/request-logs/request-log.context";
import { RequestLogWriter } from "../../application/request-logs/request-log.writer";
import { clientIp } from "./kernel-throttler.guard";

export type TracedRequest = Request & { traceId?: string };

/** Where ProblemFilter / the OAuth error path leave the error for the log. */
export function setProblemMark(response: unknown, problem: ProblemMark): void {
  const locals = (response as { locals?: Record<string, unknown> })?.locals;
  if (locals) locals.requestLogProblem = problem;
}

/**
 * E9 — gives every request a trace id (`X-Trace-Id`, and `traceId` in
 * Problem Details) and, once the response is sent, records it if a guard
 * authenticated it as a developer app. Recording only queues the entry
 * (RequestLogWriter writes in batches), so the response is never delayed.
 */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  constructor(private readonly writer: RequestLogWriter) {}

  use(request: TracedRequest, response: Response, next: NextFunction): void {
    const started = process.hrtime.bigint();
    const traceId = resolveTraceId((name) => request.header(name));
    request.traceId = traceId;
    response.setHeader("X-Trace-Id", traceId);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const identity = appIdentity(request as AppRequestMarks);
      if (!identity) return;
      this.writer.record(
        buildEntry({
          identity,
          method: request.method,
          routePath: (request as { route?: { path?: unknown } }).route?.path,
          status: response.statusCode,
          problem: response.locals?.requestLogProblem as
            ProblemMark | undefined,
          latencyMs: Number(process.hrtime.bigint() - started) / 1e6,
          traceId,
          ip: clientIp(request),
          at: new Date(),
        }),
      );
    };
    response.once("finish", finish);
    response.once("close", finish);
    next();
  }
}
