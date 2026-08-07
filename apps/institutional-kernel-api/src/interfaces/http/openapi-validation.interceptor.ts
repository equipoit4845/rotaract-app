import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  OnModuleInit,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable, tap } from "rxjs";

import { OpenApiValidationService } from "./openapi-validation.service";

@Injectable()
export class OpenApiValidationInterceptor
  implements NestInterceptor, OnModuleInit
{
  constructor(private readonly validator: OpenApiValidationService) {}

  onModuleInit(): void {
    this.validator.load();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.validator.isEnabled() || context.getType() !== "http")
      return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    const operation = this.validator.operation(request.method, request.path);
    if (!operation) return next.handle();
    this.validator.validateRequest(operation, {
      body: request.body,
      params: request.params,
      query: request.query,
      headers: request.headers,
    });
    if (!this.validator.validatesResponses()) return next.handle();
    const response = context
      .switchToHttp()
      .getResponse<{ statusCode: number }>();
    return next
      .handle()
      .pipe(
        tap((value) =>
          this.validator.validateResponse(
            operation,
            response.statusCode,
            value,
          ),
        ),
      );
  }
}
