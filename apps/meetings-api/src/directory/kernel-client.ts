import { Injectable, Logger } from '@nestjs/common';

/** Data API v1 views used by the sync (kernel-openapi.yaml, docs/developers/api-de-datos.md). */
export type OrganizationView = {
  id: string;
  type: 'DISTRICT' | 'CLUB' | 'OTHER';
  code: string;
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  parentId: string | null;
  updatedAt: string;
};

export type PersonView = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  updatedAt: string;
};

export type MemberView = {
  membershipId: string;
  organizationId: string;
  personId: string;
  status: 'PENDING' | 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE' | 'GRADUATED' | 'TRANSFERRED';
  person: PersonView;
  updatedAt: string;
};

export type PersonMembershipView = {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationType: 'DISTRICT' | 'CLUB' | 'OTHER';
  status: MemberView['status'];
};

export type AuthorityView = {
  appointmentId: string;
  organizationId: string;
  periodId: string;
  positionCode: string;
  positionName: string;
  status: string;
  person: { id: string; displayName: string; avatarUrl: string | null };
};

type Page<T> = { items: T[]; pageInfo: { nextCursor: string | null; hasMore: boolean } };

export class KernelHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Minimal client for the kernel `/service/*` Data API using a
 * client_credentials service token (docs/developers/autenticacion-servidor.md).
 *
 * Env: KERNEL_API_URL (base, e.g. http://api:3001/api/kernel/v1),
 * KERNEL_CLIENT_ID, KERNEL_CLIENT_SECRET.
 */
@Injectable()
export class KernelClient {
  private readonly logger = new Logger(KernelClient.name);
  private token: { value: string; expiresAt: number } | null = null;

  get baseUrl(): string | null {
    const raw = process.env.KERNEL_API_URL?.trim();
    return raw ? raw.replace(/\/+$/, '') : null;
  }

  get configured(): boolean {
    return !!(this.baseUrl && process.env.KERNEL_CLIENT_ID && process.env.KERNEL_CLIENT_SECRET);
  }

  private timeoutMs(): number {
    return Number(process.env.KERNEL_HTTP_TIMEOUT_MS ?? 15000);
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 30_000 > Date.now()) return this.token.value;
    const id = process.env.KERNEL_CLIENT_ID ?? '';
    const secret = process.env.KERNEL_CLIENT_SECRET ?? '';
    const basic = Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(this.timeoutMs()),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new KernelHttpError(res.status, `client_credentials failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const body = (await res.json()) as { access_token: string; expires_in?: number };
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 600) * 1000,
    };
    return this.token.value;
  }

  async get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    if (!this.configured)
      throw new Error('Kernel client not configured (KERNEL_API_URL / KERNEL_CLIENT_ID / KERNEL_CLIENT_SECRET)');
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    let attempt = 0;
    for (;;) {
      const token = await this.getToken();
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
      if (res.status === 401 && attempt === 0) {
        // token revoked / rotated: retry once with a fresh one
        this.token = null;
        attempt++;
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new KernelHttpError(res.status, `GET ${path} -> ${res.status} ${text.slice(0, 200)}`);
      }
      return (await res.json()) as T;
    }
  }

  async paginate<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.get<Page<T>>(path, { ...query, limit: 100, cursor });
      items.push(...page.items);
      cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
    } while (cursor);
    return items;
  }

  listOrganizations() {
    return this.paginate<OrganizationView>('/service/organizations');
  }

  listMembers(organizationId: string) {
    return this.paginate<MemberView>(`/service/organizations/${encodeURIComponent(organizationId)}/members`);
  }

  listAuthorities(organizationId: string, includeDescendants: boolean) {
    return this.get<AuthorityView[]>(
      `/service/organizations/${encodeURIComponent(organizationId)}/authorities`,
      includeDescendants ? { includeDescendants: true } : undefined,
    );
  }

  getPerson(personId: string) {
    return this.get<PersonView>(`/service/persons/${encodeURIComponent(personId)}`);
  }

  personMemberships(personId: string) {
    return this.get<PersonMembershipView[]>(`/service/persons/${encodeURIComponent(personId)}/memberships`);
  }
}
