import type {
  AuthoritySnapshot,
  AuthorizationCheckRequest,
  AuthorizationDecision,
  BatchAuthorizationCheckRequest,
  IntrospectionResult,
  MembershipSnapshot,
  ModuleInstallationSummary,
  OrganizationSummary,
  PeriodSnapshot,
  PersonSummary,
  UserContext,
} from "@mirotaract/kernel-contracts";

export type KernelClientOptions = {
  /** Must already include the API's versioned path, e.g. http://kernel:3001/api/kernel/v1 */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  /**
   * Service credential sent as `Authorization: Bearer <token>` on every
   * /auth/introspect and /service/* call (kernel-spec.md §14.3). Accepts a
   * static token or a factory for callers that rotate/refresh it.
   */
  serviceToken?: string | (() => string | Promise<string>);
};

/**
 * Thin, typed client over the institutional kernel's public HTTP API and
 * its /service/* read model (kernel-spec.md §12.1). Consumers (Meetings,
 * Events, ...) use this instead of talking to the kernel's database
 * directly — the kernel's decision "kernel-spec.md §22.5 los consumidores
 * no comparten Prisma" depends on this being the only integration path.
 */
export class KernelClient implements KernelClientInterface {
  private readonly options: KernelClientOptions;
  private readonly request: typeof globalThis.fetch;

  constructor(options: KernelClientOptions) {
    this.options = options;
    this.request = options.fetch ?? globalThis.fetch;
  }

  async version(): Promise<{ service: string; version: string }> {
    return this.get("/version");
  }

  async introspect(token: string): Promise<IntrospectionResult> {
    return this.post("/auth/introspect", { token }, { auth: true });
  }

  async getUserContext(accountId: string): Promise<UserContext> {
    return this.get(`/service/users/${encodeURIComponent(accountId)}/context`, {
      auth: true,
    });
  }

  async getPerson(personId: string): Promise<PersonSummary> {
    return this.get(`/service/persons/${encodeURIComponent(personId)}`, {
      auth: true,
    });
  }

  async getOrganization(organizationId: string): Promise<OrganizationSummary> {
    return this.get(
      `/service/organizations/${encodeURIComponent(organizationId)}`,
      { auth: true },
    );
  }

  async getMembershipSnapshot(
    organizationId: string,
    options?: { status?: string[]; at?: string },
  ): Promise<MembershipSnapshot> {
    const query = new URLSearchParams();
    for (const status of options?.status ?? []) query.append("status", status);
    if (options?.at) query.set("at", options.at);
    return this.get(
      `/service/organizations/${encodeURIComponent(organizationId)}/membership-snapshot${suffix(query)}`,
      { auth: true },
    );
  }

  async getAuthoritySnapshot(
    organizationId: string,
    options?: { periodId?: string; at?: string },
  ): Promise<AuthoritySnapshot> {
    const query = new URLSearchParams();
    if (options?.periodId) query.set("periodId", options.periodId);
    if (options?.at) query.set("at", options.at);
    return this.get(
      `/service/organizations/${encodeURIComponent(organizationId)}/authority-snapshot${suffix(query)}`,
      { auth: true },
    );
  }

  async getPeriodSnapshot(
    organizationId: string,
    options?: { at?: string },
  ): Promise<PeriodSnapshot> {
    const query = new URLSearchParams();
    if (options?.at) query.set("at", options.at);
    return this.get(
      `/service/organizations/${encodeURIComponent(organizationId)}/period-snapshot${suffix(query)}`,
      { auth: true },
    );
  }

  async checkAuthorization(
    request: AuthorizationCheckRequest,
  ): Promise<AuthorizationDecision> {
    return this.post("/service/authorization/check", request, { auth: true });
  }

  async batchCheckAuthorization(
    request: BatchAuthorizationCheckRequest,
  ): Promise<AuthorizationDecision[]> {
    return this.post("/service/authorization/batch-check", request, {
      auth: true,
    });
  }

  async getModuleInstallation(
    organizationId: string,
    moduleId: string,
  ): Promise<ModuleInstallationSummary> {
    return this.get(
      `/service/modules/${encodeURIComponent(moduleId)}/installations/${encodeURIComponent(organizationId)}`,
      { auth: true },
    );
  }

  private async authHeaders(auth?: boolean): Promise<Record<string, string>> {
    if (!auth || !this.options.serviceToken) return {};
    const token =
      typeof this.options.serviceToken === "function"
        ? await this.options.serviceToken()
        : this.options.serviceToken;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private async get<T>(
    path: string,
    opts: { auth?: boolean } = {},
  ): Promise<T> {
    return this.send<T>(path, {
      method: "GET",
      headers: await this.authHeaders(opts.auth),
    });
  }

  private async post<T>(
    path: string,
    body: unknown,
    opts: { auth?: boolean } = {},
  ): Promise<T> {
    return this.send<T>(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await this.authHeaders(opts.auth)),
      },
      body: JSON.stringify(body),
    });
  }

  private async send<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.request(`${this.options.baseUrl}${path}`, init);
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Kernel API request failed: ${init.method ?? "GET"} ${path} -> ${response.status}${detail ? ` ${detail}` : ""}`,
      );
    }
    return response.json() as Promise<T>;
  }
}

function suffix(query: URLSearchParams): string {
  const value = query.toString();
  return value ? `?${value}` : "";
}

/** kernel-spec.md §12.1 — the documented KernelClient contract. */
export interface KernelClientInterface {
  introspect(token: string): Promise<IntrospectionResult>;
  getUserContext(accountId: string): Promise<UserContext>;
  getPerson(personId: string): Promise<PersonSummary>;
  getOrganization(organizationId: string): Promise<OrganizationSummary>;
  getMembershipSnapshot(
    organizationId: string,
    options?: { status?: string[]; at?: string },
  ): Promise<MembershipSnapshot>;
  getAuthoritySnapshot(
    organizationId: string,
    options?: { periodId?: string; at?: string },
  ): Promise<AuthoritySnapshot>;
  getPeriodSnapshot(
    organizationId: string,
    options?: { at?: string },
  ): Promise<PeriodSnapshot>;
  checkAuthorization(
    request: AuthorizationCheckRequest,
  ): Promise<AuthorizationDecision>;
  batchCheckAuthorization(
    request: BatchAuthorizationCheckRequest,
  ): Promise<AuthorizationDecision[]>;
  getModuleInstallation(
    organizationId: string,
    moduleId: string,
  ): Promise<ModuleInstallationSummary>;
}
