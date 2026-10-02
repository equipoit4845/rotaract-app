import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MembershipStatus,
  OrganizationStatus,
  OrganizationType,
  PeriodStatus,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { ServiceIdentity } from "../auth/service-api.guard";
import {
  afterCursor,
  decodeCursor,
  pageOrder,
  parseLimit,
  parseUpdatedSince,
  toPage,
} from "./paging";
import {
  toAuthorityView,
  toMemberView,
  toOrganizationView,
  toPeriodView,
  toPersonMembershipView,
  toPersonView,
} from "./views";

export const CONTACT_SCOPE = "kernel.service.persons.contact.read";
export const MAX_BATCH_PERSONS = 100;

type Query = Record<string, unknown>;

/**
 * Data API v1 for developer apps (docs/12-data-api-and-sdks.md §E4).
 *
 * ServiceApiGuard has already checked the scope and that any route
 * `organizationId` / `personId` is inside the app's tree; this service
 * additionally filters every listing by that tree, so a collection never
 * contains another organization's data. `allowedOrganizationIds` undefined
 * means the development-only unrestricted credential.
 */
@Injectable()
export class DataApiService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrganizations(service: ServiceIdentity, query: Query) {
    const limit = parseLimit(query.limit);
    const updatedSince = parseUpdatedSince(query.updatedSince);
    const cursor = optionalString(query.cursor);
    const where: Prisma.OrganizationWhereInput = {
      AND: [
        service.allowedOrganizationIds
          ? { id: { in: service.allowedOrganizationIds } }
          : {},
        query.type
          ? { type: enumValue(OrganizationType, query.type, "type") }
          : {},
        query.status
          ? { status: enumValue(OrganizationStatus, query.status, "status") }
          : {},
        query.parentId ? { parentId: String(query.parentId) } : {},
        updatedSince ? { updatedAt: { gt: updatedSince } } : {},
        afterCursor(cursor ? decodeCursor(cursor) : undefined),
      ],
    };
    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: pageOrder,
      take: limit + 1,
    });
    return toPage(rows, limit, toOrganizationView);
  }

  async getOrganization(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
    });
    if (!organization) throw new NotFoundException("Organization not found");
    return toOrganizationView(organization);
  }

  /**
   * Members of exactly this organization (not its descendants). Pages are
   * ordered by the membership's (updatedAt, id); `updatedSince` matches a
   * change to either the membership or the person, and each item's
   * `updatedAt` is the later of the two (see toMemberView).
   */
  async listMembers(
    service: ServiceIdentity,
    organizationId: string,
    query: Query,
  ) {
    await this.assertOrganizationExists(organizationId);
    const limit = parseLimit(query.limit);
    const updatedSince = parseUpdatedSince(query.updatedSince);
    const cursor = optionalString(query.cursor);
    const where: Prisma.OrganizationMembershipWhereInput = {
      AND: [
        { organizationId },
        query.status
          ? { status: enumValue(MembershipStatus, query.status, "status") }
          : {},
        updatedSince
          ? {
              OR: [
                { updatedAt: { gt: updatedSince } },
                { person: { updatedAt: { gt: updatedSince } } },
              ],
            }
          : {},
        afterCursor(cursor ? decodeCursor(cursor) : undefined),
      ],
    };
    const rows = await this.prisma.organizationMembership.findMany({
      where,
      include: { person: true },
      orderBy: pageOrder,
      take: limit + 1,
    });
    const contact = hasContactScope(service);
    return toPage(rows, limit, (row) => toMemberView(row, { contact }));
  }

  /**
   * ACTIVE appointments in the organization's ACTIVE period(s). With
   * includeDescendants, the organization's subtree intersected with what the
   * app may see.
   */
  async listAuthorities(
    service: ServiceIdentity,
    organizationId: string,
    query: Query,
  ) {
    await this.assertOrganizationExists(organizationId);
    let organizationIds = [organizationId];
    if (parseBoolean(query.includeDescendants, "includeDescendants")) {
      organizationIds = await this.subtree(organizationId);
      const allowed = service.allowedOrganizationIds;
      if (allowed)
        organizationIds = organizationIds.filter((id) => allowed.includes(id));
    }
    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId: { in: organizationIds },
        status: "ACTIVE",
        period: { status: "ACTIVE" },
      },
      include: {
        positionDefinition: true,
        membership: { include: { person: true } },
      },
      orderBy: [
        { organizationId: "asc" },
        { positionDefinition: { code: "asc" } },
        { id: "asc" },
      ],
    });
    return appointments.map(toAuthorityView);
  }

  async listPeriods(organizationId: string, query: Query) {
    await this.assertOrganizationExists(organizationId);
    const periods = await this.prisma.institutionalPeriod.findMany({
      where: {
        organizationId,
        ...(query.status
          ? { status: enumValue(PeriodStatus, query.status, "status") }
          : {}),
      },
      orderBy: [{ sequence: "desc" }, { id: "asc" }],
    });
    return periods.map(toPeriodView);
  }

  async getPerson(service: ServiceIdentity, personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
    });
    if (!person) throw new NotFoundException("Person not found");
    return toPersonView(person, { contact: hasContactScope(service) });
  }

  /**
   * Up to 100 ids, returned in request order (duplicates and unknown ids
   * dropped). Persons without a membership in the app's tree are silently
   * omitted, so the response doesn't reveal whether an id exists.
   */
  async batchPersons(service: ServiceIdentity, body: unknown) {
    const ids = (body as { ids?: unknown } | null)?.ids;
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id) => typeof id === "string")
    )
      throw new BadRequestException("ids must be a non-empty array of strings");
    if (ids.length > MAX_BATCH_PERSONS)
      throw new BadRequestException(
        `At most ${MAX_BATCH_PERSONS} ids per request`,
      );
    const unique = [...new Set(ids as string[])];
    const allowed = service.allowedOrganizationIds;
    const persons = await this.prisma.person.findMany({
      where: {
        id: { in: unique },
        ...(allowed
          ? { memberships: { some: { organizationId: { in: allowed } } } }
          : {}),
      },
    });
    const byId = new Map(persons.map((person) => [person.id, person]));
    const contact = hasContactScope(service);
    return unique
      .map((id) => byId.get(id))
      .filter((person) => person !== undefined)
      .map((person) => toPersonView(person, { contact }));
  }

  async personMemberships(service: ServiceIdentity, personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException("Person not found");
    const allowed = service.allowedOrganizationIds;
    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        personId,
        ...(allowed ? { organizationId: { in: allowed } } : {}),
      },
      include: { organization: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return memberships.map(toPersonMembershipView);
  }

  private async assertOrganizationExists(id: string): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException("Organization not found");
  }

  /** The organization and all its descendants. */
  private async subtree(rootId: string): Promise<string[]> {
    const ids = [rootId];
    let frontier = [rootId];
    while (frontier.length) {
      const children = await this.prisma.organization.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      frontier = children
        .map((child) => child.id)
        .filter((id) => !ids.includes(id));
      ids.push(...frontier);
    }
    return ids;
  }
}

export function hasContactScope(service: ServiceIdentity): boolean {
  return service.scopes.includes("*") || service.scopes.includes(CONTACT_SCOPE);
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string")
    throw new BadRequestException("Invalid query parameter");
  return value;
}

function enumValue<T extends Record<string, string>>(
  values: T,
  value: unknown,
  name: string,
): T[keyof T] {
  if (typeof value !== "string" || !Object.values(values).includes(value))
    throw new BadRequestException(`Invalid ${name}`);
  return value as T[keyof T];
}

function parseBoolean(value: unknown, name: string): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true" || value === true) return true;
  throw new BadRequestException(`${name} must be true or false`);
}
