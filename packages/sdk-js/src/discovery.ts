import {
  createLocalJWKSet,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from "jose";

import { MiRotaractConfigError } from "./errors.ts";
import type { HttpClient } from "./http.ts";
import type { OpenIdConfiguration } from "./types.ts";

export function normalizeIssuer(issuer: string): string {
  return issuer.replace(/\/+$/, "");
}

/**
 * `{issuer}/.well-known/openid-configuration`, fetched once and cached
 * (default 1 h). Failed fetches are not cached.
 */
export class Discovery {
  readonly issuer: string;
  private cached: { value: OpenIdConfiguration; at: number } | undefined;
  private inflight: Promise<OpenIdConfiguration> | undefined;

  private readonly http: HttpClient;
  private readonly ttlMs: number;

  constructor(issuer: string, http: HttpClient, ttlMs = 60 * 60 * 1000) {
    this.http = http;
    this.ttlMs = ttlMs;
    if (!issuer) throw new MiRotaractConfigError("Falta `issuer` / `baseUrl`.");
    this.issuer = normalizeIssuer(issuer);
  }

  async get(): Promise<OpenIdConfiguration> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs)
      return this.cached.value;
    this.inflight ??= this.fetch().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async fetch(): Promise<OpenIdConfiguration> {
    const { data } = await this.http.request<OpenIdConfiguration>({
      method: "GET",
      url: `${this.issuer}/.well-known/openid-configuration`,
    });
    if (!data || normalizeIssuer(String(data.issuer)) !== this.issuer)
      throw new MiRotaractConfigError(
        `El discovery declara issuer "${data?.issuer}", distinto del configurado "${this.issuer}".`,
      );
    this.cached = { value: data, at: Date.now() };
    return data;
  }
}

/**
 * Remote JWKS fetched through the SDK's own fetch (so custom fetch, retries
 * and timeouts apply), cached for `ttlMs` and re-fetched once when a token
 * names an unknown `kid` (key rotation), at most every `cooldownMs`.
 */
export class JwksCache {
  private keys: { set: JWTVerifyGetKey; at: number } | undefined;
  private inflight: Promise<JWTVerifyGetKey> | undefined;
  private lastFetch = 0;

  private readonly http: HttpClient;
  private readonly uri: () => Promise<string>;
  private readonly ttlMs: number;
  private readonly cooldownMs: number;

  constructor(
    http: HttpClient,
    uri: () => Promise<string>,
    ttlMs = 10 * 60 * 1000,
    cooldownMs = 30 * 1000,
  ) {
    this.http = http;
    this.uri = uri;
    this.ttlMs = ttlMs;
    this.cooldownMs = cooldownMs;
  }

  /** A jose key resolver usable with `jwtVerify`. */
  readonly getKey: JWTVerifyGetKey = async (header, token) => {
    const set = await this.load(false);
    try {
      return await set(header, token);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (
        code === "ERR_JWKS_NO_MATCHING_KEY" &&
        Date.now() - this.lastFetch >= this.cooldownMs
      )
        return (await this.load(true))(header, token);
      throw error;
    }
  };

  private async load(force: boolean): Promise<JWTVerifyGetKey> {
    if (!force && this.keys && Date.now() - this.keys.at < this.ttlMs)
      return this.keys.set;
    this.inflight ??= (async () => {
      this.lastFetch = Date.now();
      const { data } = await this.http.request<JSONWebKeySet>({
        method: "GET",
        url: await this.uri(),
      });
      const set = createLocalJWKSet(data);
      this.keys = { set, at: Date.now() };
      return set;
    })().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }
}
