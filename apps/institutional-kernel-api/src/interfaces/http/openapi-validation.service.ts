import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

type Operation = Record<string, unknown>;
type OpenApiDocument = {
  paths?: Record<string, Record<string, Operation>>;
};

/**
 * Runtime validation is deliberately opt-in.  It gives deployments and the
 * contract test suite an executable OpenAPI boundary without making a missing
 * specification file a production availability dependency.  Set
 * KERNEL_OPENAPI_RUNTIME_VALIDATION=true to enforce incoming requests and
 * KERNEL_OPENAPI_RESPONSE_VALIDATION=true to validate successful responses.
 */
@Injectable()
export class OpenApiValidationService {
  private readonly enabled =
    process.env.KERNEL_OPENAPI_RUNTIME_VALIDATION === "true";
  private readonly responsesEnabled =
    process.env.KERNEL_OPENAPI_RESPONSE_VALIDATION === "true";
  private readonly ajv = addFormats(
    new Ajv({ allErrors: true, coerceTypes: true, strict: false }),
  );
  private document?: OpenApiDocument;
  private validators = new WeakMap<object, ValidateFunction>();

  isEnabled(): boolean {
    return this.enabled;
  }

  validatesResponses(): boolean {
    return this.enabled && this.responsesEnabled;
  }

  load(): void {
    if (!this.enabled || this.document) return;
    const path = this.openApiPath();
    if (!path) {
      throw new Error(
        "KERNEL_OPENAPI_RUNTIME_VALIDATION=true requires kernel-openapi.yaml (or KERNEL_OPENAPI_PATH)",
      );
    }
    this.document = parse(readFileSync(path, "utf8")) as OpenApiDocument;
  }

  operation(method: string, rawPath: string): Operation | undefined {
    this.load();
    const path = rawPath.replace(/^\/api\/kernel\/v1(?=\/|$)/, "") || "/";
    for (const [template, methods] of Object.entries(
      this.document?.paths ?? {},
    )) {
      if (!matches(template, path)) continue;
      return methods[method.toLowerCase()];
    }
    return undefined;
  }

  validateRequest(
    operation: Operation,
    request: {
      body: unknown;
      params: Record<string, unknown>;
      query: Record<string, unknown>;
      headers: Record<string, unknown>;
    },
  ): void {
    const requestBody = operation.requestBody as
      Record<string, unknown> | undefined;
    const bodySchema = contentSchema(requestBody);
    // An optional body omitted by the caller is valid (e.g. install a module
    // with its default configuration). If present, it is still validated.
    if (
      bodySchema &&
      (requestBody?.required === true || request.body !== undefined)
    )
      this.assert(bodySchema, request.body, "request body");
    for (const rawParameter of (operation.parameters as
      Array<Record<string, unknown>> | undefined) ?? []) {
      const parameter = this.resolveReference(rawParameter);
      if (!parameter) continue;
      const name = parameter.name as string | undefined;
      const location = parameter.in as string | undefined;
      if (!name || !location) continue;
      const source =
        location === "path"
          ? request.params
          : location === "query"
            ? request.query
            : request.headers;
      const value = source[name];
      if (value === undefined && parameter.required) {
        throw new BadRequestException(
          `Missing required ${location} parameter: ${name}`,
        );
      }
      if (value !== undefined && parameter.schema)
        this.assert(
          parameter.schema as object,
          value,
          `${location} parameter: ${name}`,
        );
    }
  }

  validateResponse(
    operation: Operation,
    statusCode: number,
    value: unknown,
  ): void {
    const responses = operation.responses as
      Record<string, Record<string, unknown>> | undefined;
    const response = this.resolveReference(
      responses?.[String(statusCode)] ?? responses?.default,
    );
    const schema = contentSchema(response);
    // Interceptors run before Express serializes Prisma Date values. Validate
    // the exact JSON representation clients receive, rather than its in-memory
    // Nest representation.
    if (schema)
      this.assert(
        schema,
        value === undefined ? value : JSON.parse(JSON.stringify(value)),
        `response ${statusCode}`,
        true,
      );
  }

  private assert(
    schema: object,
    value: unknown,
    subject: string,
    response = false,
  ): void {
    let validate = this.validators.get(schema);
    if (!validate) {
      // The full document is supplied as a wrapper, preserving #/components
      // references used by OpenAPI schemas while AJV compiles an individual
      // request/response schema.
      validate = this.ajv.compile({ ...(this.document as object), ...schema });
      this.validators.set(schema, validate);
    }
    if (validate(value)) return;
    const errors = this.ajv.errorsText(validate.errors, { separator: "; " });
    if (response)
      throw new InternalServerErrorException(
        `OpenAPI contract violation: ${subject}: ${errors}`,
      );
    throw new BadRequestException(
      `OpenAPI validation failed for ${subject}: ${errors}`,
    );
  }

  private openApiPath(): string | undefined {
    const explicit = process.env.KERNEL_OPENAPI_PATH;
    const candidates = [
      explicit,
      resolve(process.cwd(), "kernel-openapi.yaml"),
      resolve(process.cwd(), "../../kernel-openapi.yaml"),
      resolve(__dirname, "../../../../../kernel-openapi.yaml"),
    ].filter((candidate): candidate is string => Boolean(candidate));
    return candidates.find((candidate) => existsSync(candidate));
  }

  private resolveReference(
    value: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    const reference = value?.$ref;
    if (typeof reference !== "string" || !reference.startsWith("#/"))
      return value;
    const resolved = reference
      .slice(2)
      .split("/")
      .reduce<unknown>((node, part) => {
        if (!node || typeof node !== "object") return undefined;
        return (node as Record<string, unknown>)[part];
      }, this.document);
    return resolved && typeof resolved === "object"
      ? (resolved as Record<string, unknown>)
      : undefined;
  }
}

function contentSchema(
  container?: Record<string, unknown>,
): object | undefined {
  const content = container?.content as
    Record<string, Record<string, unknown>> | undefined;
  return content?.["application/json"]?.schema as object | undefined;
}

function matches(template: string, value: string): boolean {
  const expression = `^${template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[^}]+\\\}/g, "[^/]+")}$`;
  return new RegExp(expression).test(value);
}
