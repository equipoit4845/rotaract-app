import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { DomainError } from "../../domain/shared/domain.error";

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
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
    const traceId =
      request.header("traceparent") ??
      request.header("x-correlation-id") ??
      undefined;
    response
      .status(status)
      .type("application/problem+json")
      .send({
        type: `https://api.agendai.com.ar/errors/${code.toLowerCase()}`,
        title: status >= 500 ? "Internal Server Error" : "Request failed",
        status,
        code,
        detail,
        instance: request.originalUrl,
        traceId,
      });
  }
}
