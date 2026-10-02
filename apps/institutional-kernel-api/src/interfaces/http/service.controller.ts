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
import { DataApiService } from "../../application/data-api/data-api.service";
import { weakEtag } from "../../application/data-api/etag";
import { KernelService } from "../../application/kernel/kernel.service";

/**
 * Sets the weak ETag of a Data API GET response. Express answers 304 with
 * no body when If-None-Match matches it (see application/data-api/etag.ts).
 */
function withEtag<T>(response: Response, body: T): T {
  response.setHeader("ETag", weakEtag(body));
  return body;
}

@Controller("service")
@UseGuards(ServiceApiGuard)
export class ServiceController {
  constructor(
    private readonly kernel: KernelService,
    private readonly data: DataApiService,
  ) {}
  @Get("users/:accountId/context") userContext(
    @Param("accountId") accountId: string,
  ) {
    return this.kernel.userContext(accountId);
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
  serviceBatchPersons(@Req() request: ServiceRequest, @Body() body: unknown) {
    return this.data.batchPersons(request.service, body);
  }
  @Get("persons/:personId/memberships") async servicePersonMemberships(
    @Req() request: ServiceRequest,
    @Param("personId") personId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withEtag(
      response,
      await this.data.personMemberships(request.service, personId),
    );
  }

  // serviceGetPerson / serviceGetOrganization: PersonView / OrganizationView.
  @Get("persons/:personId") async person(
    @Req() request: ServiceRequest,
    @Param("personId") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withEtag(response, await this.data.getPerson(request.service, id));
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
  @Post("authorization/check") check(@Body() body: any) {
    return this.kernel.checkAuthorization(body);
  }
  @Post("authorization/batch-check") batch(@Body() body: any) {
    return this.kernel.batchCheckAuthorization(body);
  }
  @Get("modules/:moduleId/installations/:organizationId") installation(
    @Param("moduleId") moduleId: string,
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.serviceInstallation(moduleId, organizationId);
  }
}
