import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { DomainError } from "../../domain/shared/domain.error";
import { OAuthError } from "../../application/oauth/oauth-error";

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    // OAuth endpoints answer in RFC 6749 §5.2 / RFC 6750 §3.1 shape, which
    // is what OAuth client libraries parse, never Problem Details.
    if (error instanceof OAuthError) {
      response.setHeader("Cache-Control", "no-store");
      if (error.error === "invalid_token")
        response.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
      else if (error.status === 401)
        response.setHeader("WWW-Authenticate", 'Basic realm="mirotaract"');
      response.status(error.status).json(error.toJSON());
      return;
    }
    const prismaCode = (error as { code?: string })?.code;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error instanceof DomainError
          ? 409
          : prismaCode === "P2025"
            ? 404
            : 500;
    const detail = error instanceof Error ? error.message : "Unexpected error";
    const body =
      error instanceof HttpException ? error.getResponse() : undefined;
    const code =
      error instanceof DomainError
        ? `KERNEL_${error.code}`
        : typeof body === "object" && body && "code" in body
          ? String((body as { code: string }).code)
          : prismaCode === "P2025"
            ? "KERNEL_NOT_FOUND"
            : `KERNEL_HTTP_${status}`;
    // Field-level validation errors (e.g. a module configuration checked
    // against its JSON Schema): [{ path, message }], already in Spanish.
    const errors =
      typeof body === "object" &&
      body &&
      Array.isArray((body as { errors?: unknown }).errors) &&
      (body as { errors: unknown[] }).errors.length
        ? (body as { errors: unknown[] }).errors
        : undefined;
    const traceId =
      request.header("traceparent") ??
      request.header("x-correlation-id") ??
      undefined;
    response
      .status(status)
      .type("application/problem+json")
      .send({
        type: `https://api.rotaract4845.com/errors/${code.toLowerCase()}`,
        title: status >= 500 ? "Internal Server Error" : "Request failed",
        status,
        code,
        detail,
        instance: request.originalUrl,
        traceId,
        ...(errors ? { errors } : {}),
      });
  }
}
