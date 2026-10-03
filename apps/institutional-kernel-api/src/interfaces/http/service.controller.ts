import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import {
  ServiceApiGuard,
  type ServiceRequest,
} from "../../application/auth/service-api.guard";
import {
  DataApiService,
  hasContactScope,
} from "../../application/data-api/data-api.service";
import { AccessHistoryWriter } from "../../application/governance/access-history.writer";
import { weakEtag } from "../../application/data-api/etag";
import { KernelService } from "../../application/kernel/kernel.service";

/**
 * Sets the weak ETag of a Data API GET response. Express answers 304 with
 * no body when If-None-Match matches it (see application/data-api/etag.ts).
 */
function withEtag<T>(response: Response, body: T): T {
  response.setHeader("ETag", weakEtag(body));
  // Fetch-based clients (browsers, Node's fetch) add `Cache-Control:
  // no-cache` to any request carrying If-None-Match, and Express's freshness
  // check then never answers 304. A conditional request *is* a revalidation
  // with the origin, which is what no-cache asks for, so it may get a 304.
  const headers = response.req?.headers;
  if (headers?.["if-none-match"]) delete headers["cache-control"];
  return body;
}

/**
 * E11.2: reads that concern one identifiable person go to that person's
 * access history (docs/18-data-governance.md). Lists of a whole club are
 * not attributed person by person; they stay in the app's request logs.
 */
function recordRead(
  history: AccessHistoryWriter,
  request: ServiceRequest,
  personIds: string[],
  details: string[],
): void {
  const clientId = request.service.clientId;
  if (!clientId) return;
  for (const personId of personIds)
    history.record({ personId, clientId, kind: "DATA_READ", details });
}

/** "person", plus "contact" when the token may read contact fields. */
function personDetails(request: ServiceRequest): string[] {
  return hasContactScope(request.service) ? ["person", "contact"] : ["person"];
}

@Controller("service")
@UseGuards(ServiceApiGuard)
export class ServiceController {
  constructor(
    private readonly kernel: KernelService,
    private readonly data: DataApiService,
    private readonly history: AccessHistoryWriter,
  ) {}
  /**
   * The person is in the app's scope (checked by ServiceApiGuard), but their
   * memberships and workspaces elsewhere are not: a club app only sees its
   * own club.
   */
  @Get("users/:accountId/context") async userContext(
    @Param("accountId") accountId: string,
    @Req() request: ServiceRequest,
  ) {
    const context = await this.kernel.userContext(accountId);
    recordRead(this.history, request, [context.personId], ["account-context"]);
    const allowed = request.service.allowedOrganizationIds;
    if (!allowed) return context;
    const visible = new Set(allowed);
    return {
      ...context,
      memberships: context.memberships.filter((m) =>
        visible.has(m.organizationId),
      ),
      workspaces: context.workspaces?.filter((w) =>
        visible.has(w.organizationId),
      ),
    };
  }

  // --- Data API v1 (docs/12-data-api-and-sdks.md §E4) -------------------

  @Get("organizations") async serviceListOrganizations(
    @Req() request: ServiceRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withEtag(
      response,
      await this.data.listOrganizations(request.service, query),
    );
  }
  @Get("organizations/:organizationId/members") async serviceListMembers(
    @Req() request: ServiceRequest,
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withEtag(
      response,
      await this.data.listMembers(request.service, organizationId, query),
    );
  }
  @Get("organizations/:organizationId/authorities")
  async serviceListAuthorities(
    @Req() request: ServiceRequest,
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withEtag(
      response,
      await this.data.listAuthorities(request.service, organizationId, query),
    );
  }
  @Get("organizations/:organizationId/periods") async serviceListPeriods(
    @Param("organizationId") organizationId: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withEtag(
      response,
      await this.data.listPeriods(organizationId, query),
    );
  }
  // Declared before persons/:personId so "batch" is never read as an id.
  @Post("persons/batch")
  @HttpCode(200)
  async serviceBatchPersons(
    @Req() request: ServiceRequest,
    @Body() body: unknown,
  ) {
    const persons = await this.data.batchPersons(request.service, body);
    recordRead(
      this.history,
      request,
      persons.map((person) => person.id),
      personDetails(request),
    );
    return persons;
  }
  @Get("persons/:personId/memberships") async servicePersonMemberships(
    @Req() request: ServiceRequest,
    @Param("personId") personId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const memberships = await this.data.personMemberships(
      request.service,
      personId,
    );
    recordRead(this.history, request, [personId], ["person-memberships"]);
    return withEtag(response, memberships);
  }

  // serviceGetPerson / serviceGetOrganization: PersonView / OrganizationView.
  @Get("persons/:personId") async person(
    @Req() request: ServiceRequest,
    @Param("personId") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const person = await this.data.getPerson(request.service, id);
    recordRead(this.history, request, [id], personDetails(request));
    return withEtag(response, person);
  }
  @Get("organizations/:organizationId") async organization(
    @Param("organizationId") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withEtag(response, await this.data.getOrganization(id));
  }

  // --- Snapshots and authorization --------------------------------------

  @Get("organizations/:organizationId/membership-snapshot") membership(
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.serviceMembershipSnapshot(organizationId);
  }
  @Get("organizations/:organizationId/authority-snapshot") authorities(
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.serviceAuthoritySnapshot(organizationId);
  }
  @Get("organizations/:organizationId/period-snapshot") period(
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.servicePeriodSnapshot(organizationId);
  }
  // The contract (and kernel-spec §9.8) answers a decision with 200, not 201.
  @Post("authorization/check")
  @HttpCode(200)
  check(@Body() body: any) {
    return this.kernel.checkAuthorization(body);
  }
  @Post("authorization/batch-check")
  @HttpCode(200)
  batch(@Body() body: any) {
    return this.kernel.batchCheckAuthorization(body);
  }
  @Get("modules/:moduleId/installations/:organizationId") installation(
    @Param("moduleId") moduleId: string,
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.serviceInstallation(moduleId, organizationId);
  }
}
