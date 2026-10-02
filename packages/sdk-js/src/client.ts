import {
  assertSecretAllowed,
  requestToken,
  type ClientAuthMethod,
} from "./auth.ts";
import { Discovery } from "./discovery.ts";
import { MiRotaractApiError, MiRotaractConfigError } from "./errors.ts";
import {
  HttpClient,
  randomId,
  type HttpOptions,
  type HttpRequest,
  type HttpResponse,
  type QueryValue,
} from "./http.ts";
import {
  Paginator,
  type NotModified,
  type Page,
  type PageInfo,
} from "./pagination.ts";
import type {
  AuthorityView,
  AuthorizationDecision,
  MembershipStatus,
  MemberView,
  OpenIdConfiguration,
  OrganizationStatus,
  OrganizationType,
  OrganizationView,
  PeriodStatus,
  PeriodView,
  PersonMembershipView,
  PersonView,
  ScopeType,
  TokenSet,
} from "./types.ts";

export type MiRotaractOptions = HttpOptions & {
  /** Kernel API base URL (it is also the OIDC issuer), e.g. https://api.rotaract4845.com/api/kernel/v1 */
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Service scopes to request; default: all the app has. */
  scope?: string | string[];
  /** Default `client_secret_basic`. */
  clientAuthMethod?: ClientAuthMethod;
  /** Overrides the discovered token endpoint. */
  tokenEndpoint?: string;
  /** Renew the token this long before it expires. Default 60 s. */
  tokenRefreshSkewSec?: number;
  /** Allows a client secret in a browser-like runtime. Don't. */
  dangerouslyAllowBrowser?: boolean;
};

type ListOptions = {
  limit?: number;
  /** ETag of a previous first page: a 304 yields `{ notModified: true }` from `.page()`. */
  ifNoneMatch?: string;
  signal?: AbortSignal;
};

export type ClubListOptions = ListOptions & {
  type?: OrganizationType;
  status?: OrganizationStatus;
  parentId?: string;
  updatedSince?: string | Date;
};

export type MemberListOptions = ListOptions & {
  status?: MembershipStatus;
  updatedSince?: string | Date;
};

export type PermissionCheck = {
  personId: string;
  permission: string;
  organizationId: string;
  /** Default ORGANIZATION. */
  scopeType?: ScopeType;
  periodId?: string | null;
  resource?: {
    type: string;
    id: string;
    attributes?: Record<string, unknown>;
  } | null;
};

/**
 * Server client for the data API v1 (`/service/*`). Authenticates with
 * client_credentials and caches the service token until 60 s before it
 * expires. Never use it in a browser: it needs the client secret.
 */
export class MiRotaract {
  readonly baseUrl: string;
  readonly clubs: ClubsResource;
  /** Alias of `clubs` (lists every organization visible to the app). */
  readonly organizations: ClubsResource;
  readonly members: MembersResource;
  readonly persons: PersonsResource;
  readonly authorities: AuthoritiesResource;
  readonly periods: PeriodsResource;
  readonly permissions: PermissionsResource;

  private readonly http: HttpClient;
  private readonly discoveryDoc: Discovery;
  private readonly options: MiRotaractOptions;
  private token:
    { value: string; expiresAt: number; scope: string } | undefined;
  private tokenInflight: Promise<string> | undefined;

  constructor(options: MiRotaractOptions) {
    if (!options?.baseUrl) throw new MiRotaractConfigError("Falta `baseUrl`.");
    if (!options.clientId) throw new MiRotaractConfigError("Falta `clientId`.");
    if (!options.clientSecret)
      throw new MiRotaractConfigError(
        "Falta `clientSecret`: el cliente de servidor usa client_credentials. Para login de personas usá MiRotaractAuth.",
      );
    assertSecretAllowed(options.clientSecret, options.dangerouslyAllowBrowser);
    this.options = options;
    this.http = new HttpClient(options);
    this.discoveryDoc = new Discovery(options.baseUrl, this.http);
    this.baseUrl = this.discoveryDoc.issuer;
    this.clubs = new ClubsResource(this);
    this.organizations = this.clubs;
    this.members = new MembersResource(this);
    this.persons = new PersonsResource(this);
    this.authorities = new AuthoritiesResource(this);
    this.periods = new PeriodsResource(this);
    this.permissions = new PermissionsResource(this);
  }

  discovery(): Promise<OpenIdConfiguration> {
    return this.discoveryDoc.get();
  }

  /** A valid service access token (cached; renewed 60 s before expiry). */
  async getAccessToken(
    options: { forceRefresh?: boolean } = {},
  ): Promise<string> {
    const skew = (this.options.tokenRefreshSkewSec ?? 60) * 1000;
    if (
      !options.forceRefresh &&
      this.token &&
      Date.now() < this.token.expiresAt - skew
    )
      return this.token.value;
    this.tokenInflight ??= this.fetchToken().finally(() => {
      this.tokenInflight = undefined;
    });
    return this.tokenInflight;
  }

  /** Scopes granted to the current service token (after the first call). */
  get grantedScopes(): string[] {
    return this.token?.scope.split(" ").filter(Boolean) ?? [];
  }

  /** Forgets the cached token (next call asks for a new one). */
  clearToken(): void {
    this.token = undefined;
  }

  private async fetchToken(): Promise<string> {
    const endpoint =
      this.options.tokenEndpoint ?? (await this.discovery()).token_endpoint;
    const scope = Array.isArray(this.options.scope)
      ? this.options.scope.join(" ")
      : this.options.scope;
    const tokens: TokenSet = await requestToken(
      this.http,
      endpoint,
      {
        clientId: this.options.clientId,
        clientSecret: this.options.clientSecret,
        clientAuthMethod: this.options.clientAuthMethod,
      },
      { grant_type: "client_credentials", scope },
    );
    this.token = {
      value: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    };
    return tokens.accessToken;
  }

  /**
   * Authenticated request to `{baseUrl}{path}`. A 401 with a cached token
   * (revoked key, app re-enabled, ...) gets one retry with a fresh token.
   */
  async request<T = unknown>(
    request: Omit<HttpRequest, "url"> & { path: string },
  ): Promise<HttpResponse<T>> {
    const { path, ...rest } = request;
    const send = async (token: string) =>
      this.http.request<T>({
        ...rest,
        url: `${this.baseUrl}${path}`,
        headers: { ...rest.headers, authorization: `Bearer ${token}` },
      });
    const token = await this.getAccessToken();
    try {
      return await send(token);
    } catch (error) {
      if (error instanceof MiRotaractApiError && error.status === 401) {
        this.clearToken();
        return send(await this.getAccessToken({ forceRefresh: true }));
      }
      throw error;
    }
  }

  /** @internal */
  paginate<T>(
    path: string,
    query: Record<string, QueryValue>,
    options: ListOptions,
  ): Paginator<T> {
    return new Paginator<T>(async (cursor, ifNoneMatch) => {
      const response = await this.request<{ items: T[]; pageInfo: PageInfo }>({
        method: "GET",
        path,
        query: { ...query, limit: options.limit, cursor },
        headers: ifNoneMatch ? { "if-none-match": ifNoneMatch } : undefined,
        signal: options.signal,
      });
      if (response.notModified)
        return { notModified: true, etag: response.etag ?? ifNoneMatch };
      return {
        notModified: false,
        items: response.data?.items ?? [],
        pageInfo: response.data?.pageInfo ?? {
          nextCursor: null,
          hasMore: false,
        },
        etag: response.etag,
      };
    }, options.ifNoneMatch);
  }
}

const enc = encodeURIComponent;

function isoDate(value: string | Date | undefined): string | undefined {
  return value instanceof Date ? value.toISOString() : value;
}

export class ClubsResource {
  private readonly client: MiRotaract;
  constructor(client: MiRotaract) {
    this.client = client;
  }

  /** Organizations visible to the app (its own and descendants). Paginated. */
  list(options: ClubListOptions = {}): Paginator<OrganizationView> {
    return this.client.paginate<OrganizationView>(
      "/service/organizations",
      {
        type: options.type,
        status: options.status,
        parentId: options.parentId,
        updatedSince: isoDate(options.updatedSince),
      },
      options,
    );
  }

  async get(organizationId: string): Promise<OrganizationView> {
    const { data } = await this.client.request<OrganizationView>({
      method: "GET",
      path: `/service/organizations/${enc(organizationId)}`,
    });
    return data;
  }
}

export class MembersResource {
  private readonly client: MiRotaract;
  constructor(client: MiRotaract) {
    this.client = client;
  }

  /**
   * Members of an organization. Contact fields only with
   * `kernel.service.persons.contact.read`.
   *
   * Incremental sync: `members.list(orgId, { ifNoneMatch: etag }).page()`
   * returns `{ notModified: true }` when nothing changed.
   */
  list(
    organizationId: string,
    options: MemberListOptions = {},
  ): Paginator<MemberView> {
    return this.client.paginate<MemberView>(
      `/service/organizations/${enc(organizationId)}/members`,
      { status: options.status, updatedSince: isoDate(options.updatedSince) },
      options,
    );
  }
}

export class PersonsResource {
  private readonly client: MiRotaract;
  constructor(client: MiRotaract) {
    this.client = client;
  }

  async get(personId: string): Promise<PersonView> {
    const { data } = await this.client.request<PersonView>({
      method: "GET",
      path: `/service/persons/${enc(personId)}`,
    });
    return data;
  }

  /**
   * Up to 100 ids per request; longer lists are split automatically. People
   * outside the app's scope are omitted, not errors.
   */
  async batch(ids: string[]): Promise<PersonView[]> {
    const unique = [...new Set(ids)];
    const result: PersonView[] = [];
    for (let i = 0; i < unique.length; i += 100) {
      const { data } = await this.client.request<PersonView[]>({
        method: "POST",
        path: "/service/persons/batch",
        json: { ids: unique.slice(i, i + 100) },
        // Read-only POST: an Idempotency-Key makes it safely retryable.
        idempotencyKey: randomId(),
      });
      result.push(...(data ?? []));
    }
    return result;
  }

  async memberships(personId: string): Promise<PersonMembershipView[]> {
    const { data } = await this.client.request<PersonMembershipView[]>({
      method: "GET",
      path: `/service/persons/${enc(personId)}/memberships`,
    });
    return data;
  }
}

export class AuthoritiesResource {
  private readonly client: MiRotaract;
  constructor(client: MiRotaract) {
    this.client = client;
  }

  async list(
    organizationId: string,
    options: { includeDescendants?: boolean } = {},
  ): Promise<AuthorityView[]> {
    const { data } = await this.client.request<AuthorityView[]>({
      method: "GET",
      path: `/service/organizations/${enc(organizationId)}/authorities`,
      query: { includeDescendants: options.includeDescendants },
    });
    return data;
  }
}

export class PeriodsResource {
  private readonly client: MiRotaract;
  constructor(client: MiRotaract) {
    this.client = client;
  }

  async list(
    organizationId: string,
    options: { status?: PeriodStatus } = {},
  ): Promise<PeriodView[]> {
    const { data } = await this.client.request<PeriodView[]>({
      method: "GET",
      path: `/service/organizations/${enc(organizationId)}/periods`,
      query: { status: options.status },
    });
    return data;
  }
}

function toCheckRequest(check: PermissionCheck) {
  return {
    subjectId: check.personId,
    permission: check.permission,
    scope: {
      type: check.scopeType ?? "ORGANIZATION",
      organizationId: check.organizationId,
    },
    ...(check.periodId !== undefined ? { periodId: check.periodId } : {}),
    ...(check.resource !== undefined ? { resource: check.resource } : {}),
  };
}

export class PermissionsResource {
  private readonly client: MiRotaract;
  constructor(client: MiRotaract) {
    this.client = client;
  }

  /** May `personId` do `permission` in `organizationId`? */
  async check(check: PermissionCheck): Promise<AuthorizationDecision> {
    const { data } = await this.client.request<AuthorizationDecision>({
      method: "POST",
      path: "/service/authorization/check",
      json: toCheckRequest(check),
      idempotencyKey: randomId(),
    });
    return data;
  }

  /** Up to 100 checks in one request, answered in order. */
  async checkMany(checks: PermissionCheck[]): Promise<AuthorizationDecision[]> {
    const { data } = await this.client.request<AuthorizationDecision[]>({
      method: "POST",
      path: "/service/authorization/batch-check",
      json: { checks: checks.map(toCheckRequest) },
      idempotencyKey: randomId(),
    });
    return data;
  }
}

export type { NotModified, Page, PageInfo };
