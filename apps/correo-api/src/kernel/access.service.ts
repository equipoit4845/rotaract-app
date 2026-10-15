import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { KernelService } from './kernel.service';

/** Permissions of the `correo` module (mirotaract.module.json). */
export const PERMISSION_USE = 'correo.mailbox.use';
export const PERMISSION_MANAGE = 'correo.mailbox.manage';

export type Access = { canUse: boolean; canManage: boolean };

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;

/**
 * Asks the kernel whether a person holds the module permissions in the
 * district (the RDR assigns them to positions). Never decided from position
 * codes. Kernel unreachable = no access (fail closed). Answers are cached for
 * a minute, so a revoked permission stops working within that time.
 */
@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);
  private readonly cache = new Map<string, { value: Access; until: number }>();

  constructor(private readonly kernel: KernelService) {}

  async forPerson(personId: string): Promise<Access> {
    const hit = this.cache.get(personId);
    if (hit && hit.until > Date.now()) return hit.value;
    let allowed: boolean[];
    try {
      const organizationId = this.kernel.districtId;
      const decisions = await this.kernel.client.permissions.checkMany(
        [PERMISSION_USE, PERMISSION_MANAGE].map((permission) => ({ personId, permission, organizationId })),
      );
      allowed = decisions.map((d) => d.allowed === true);
    } catch (error) {
      this.logger.warn(`permission check failed: ${error instanceof Error ? error.name : 'error'}`);
      throw new ServiceUnavailableException('No pudimos verificar tus permisos. Probá de nuevo en un momento.');
    }
    const value: Access = { canUse: allowed[0] === true, canManage: allowed[1] === true };
    if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.clear();
    this.cache.set(personId, { value, until: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /** Drop a person's cached answer (e.g. after appointment.ended.v1). */
  forget(personId: string): void {
    this.cache.delete(personId);
  }
}
