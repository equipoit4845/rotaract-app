import { Injectable } from '@nestjs/common';
import { MiRotaract, type AuthorityView, type PeriodView, type PersonView } from '@mirotaract/sdk';

/** The kernel reads the mailbox lifecycle needs (faked in tests). */
export interface KernelDirectory {
  readonly districtId: string;
  person(personId: string): Promise<PersonView>;
  /** Current (ACTIVE) authorities of the district itself. */
  authorities(): Promise<AuthorityView[]>;
  periods(): Promise<PeriodView[]>;
}

export const KERNEL_DIRECTORY = Symbol('KERNEL_DIRECTORY');

/**
 * The kernel through the official SDK (client_credentials, /service/* Data
 * API). Built lazily so the app boots (and `/health` answers) without the
 * credentials.
 *
 * Env: KERNEL_API_URL — the public issuer, e.g.
 * https://api.rotaract4845.com/api/kernel/v1 (the SDK checks the discovery
 * `issuer` against it, so an in-network URL does not work), KERNEL_CLIENT_ID,
 * KERNEL_CLIENT_SECRET, CORREO_DISTRICT_ORGANIZATION_ID.
 */
@Injectable()
export class KernelService implements KernelDirectory {
  private instance: MiRotaract | null = null;

  get configured(): boolean {
    return !!(
      process.env.KERNEL_API_URL &&
      process.env.KERNEL_CLIENT_ID &&
      process.env.KERNEL_CLIENT_SECRET &&
      process.env.CORREO_DISTRICT_ORGANIZATION_ID
    );
  }

  /** The district every mailbox and permission belongs to. */
  get districtId(): string {
    const id = process.env.CORREO_DISTRICT_ORGANIZATION_ID?.trim();
    if (!id) throw new Error('Falta CORREO_DISTRICT_ORGANIZATION_ID');
    return id;
  }

  get client(): MiRotaract {
    if (this.instance) return this.instance;
    if (!this.configured) {
      throw new Error('Kernel no configurado (KERNEL_API_URL / KERNEL_CLIENT_ID / KERNEL_CLIENT_SECRET)');
    }
    this.instance = new MiRotaract({
      baseUrl: process.env.KERNEL_API_URL!.trim(),
      clientId: process.env.KERNEL_CLIENT_ID!,
      clientSecret: process.env.KERNEL_CLIENT_SECRET!,
    });
    return this.instance;
  }

  person(personId: string): Promise<PersonView> {
    return this.client.persons.get(personId);
  }

  async authorities(): Promise<AuthorityView[]> {
    const all = await this.client.authorities.list(this.districtId);
    return all.filter((a) => a.status === 'ACTIVE' && a.organizationId === this.districtId);
  }

  periods(): Promise<PeriodView[]> {
    return this.client.periods.list(this.districtId);
  }
}
