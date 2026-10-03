import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

export const DEPRECATION_POLICY_URL =
  "https://developers.rotaract4845.com/docs/deprecaciones";

export type DeprecationRule = {
  method: string;
  template: string;
  pattern: RegExp;
  /** RFC 9745 value: `@<unix seconds>`. */
  deprecation: string;
  /** RFC 8594 value (HTTP date), when the contract sets `x-sunset`. */
  sunset?: string;
  link: string;
};

const METHODS = ["get", "post", "put", "patch", "delete"];

/**
 * Rules for every operation marked `deprecated: true` in the contract
 * (docs/developers/deprecaciones.md). `x-deprecated-at` and `x-sunset` are
 * dates; `scripts/validate-openapi.mjs` enforces they exist and are ≥ 6
 * months apart. `x-deprecation-link` overrides the default policy link.
 */
export function deprecationRules(document: unknown): DeprecationRule[] {
  const paths = (document as { paths?: Record<string, unknown> })?.paths ?? {};
  const rules: DeprecationRule[] = [];
  for (const [template, methods] of Object.entries(paths)) {
    for (const method of METHODS) {
      const operation = (methods as Record<string, unknown>)?.[method] as
        Record<string, unknown> | undefined;
      if (!operation?.deprecated) continue;
      const since = Date.parse(String(operation["x-deprecated-at"] ?? ""));
      const sunset = Date.parse(String(operation["x-sunset"] ?? ""));
      rules.push({
        method: method.toUpperCase(),
        template,
        pattern: templatePattern(template),
        deprecation: `@${Math.floor((Number.isNaN(since) ? 0 : since) / 1000)}`,
        sunset: Number.isNaN(sunset)
          ? undefined
          : new Date(sunset).toUTCString(),
        link:
          typeof operation["x-deprecation-link"] === "string"
            ? (operation["x-deprecation-link"] as string)
            : `${DEPRECATION_POLICY_URL}#${String(operation.operationId ?? "")}`,
      });
    }
  }
  return rules;
}

function templatePattern(template: string): RegExp {
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{[^}]+\\\}/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

/** The rule for a request, matching like the contract's path templates. */
export function findDeprecation(
  rules: DeprecationRule[],
  method: string,
  rawPath: string,
): DeprecationRule | undefined {
  if (rules.length === 0) return undefined;
  const path = rawPath.replace(/^\/api\/kernel\/v1(?=\/|$)/, "") || "/";
  const upper = method.toUpperCase();
  return rules.find((rule) => rule.method === upper && rule.pattern.test(path));
}

export function deprecationHeaders(
  rule: DeprecationRule,
): Record<string, string> {
  return {
    Deprecation: rule.deprecation,
    ...(rule.sunset ? { Sunset: rule.sunset } : {}),
    Link: `<${rule.link}>; rel="deprecation"; type="text/html"`,
  };
}

/**
 * E9.4 — adds `Deprecation`, `Sunset` and `Link: rel="deprecation"` to the
 * responses of operations the contract marks `deprecated`. The contract is
 * read once at startup; without it nothing is added (never a hard failure).
 */
@Injectable()
export class DeprecationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DeprecationMiddleware.name);
  private rules?: DeprecationRule[];

  use(request: Request, response: Response, next: NextFunction): void {
    const rule = findDeprecation(
      this.load(),
      request.method,
      (request.originalUrl ?? request.url).split("?")[0],
    );
    if (rule)
      for (const [name, value] of Object.entries(deprecationHeaders(rule)))
        response.setHeader(name, value);
    next();
  }

  private load(): DeprecationRule[] {
    if (this.rules) return this.rules;
    const file = [
      process.env.KERNEL_OPENAPI_PATH,
      resolve(process.cwd(), "kernel-openapi.yaml"),
      resolve(process.cwd(), "../../kernel-openapi.yaml"),
      resolve(__dirname, "../../../../../kernel-openapi.yaml"),
      resolve(__dirname, "../../../kernel-openapi.yaml"),
    ].find((candidate): candidate is string =>
      Boolean(candidate && existsSync(candidate)),
    );
    try {
      this.rules = file
        ? deprecationRules(parse(readFileSync(file, "utf8")))
        : [];
    } catch (error) {
      this.logger.warn(`Could not read deprecations: ${String(error)}`);
      this.rules = [];
    }
    return this.rules;
  }
}
