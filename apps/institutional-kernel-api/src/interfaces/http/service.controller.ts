import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { ServiceApiGuard } from "../../application/auth/service-api.guard";
import { KernelService } from "../../application/kernel/kernel.service";

@Controller("service")
@UseGuards(ServiceApiGuard)
export class ServiceController {
  constructor(private readonly kernel: KernelService) {}
  @Get("users/:accountId/context") userContext(
    @Param("accountId") accountId: string,
  ) {
    return this.kernel.userContext(accountId);
  }
  @Get("persons/:personId") person(@Param("personId") id: string) {
    return this.kernel.getPerson(id);
  }
  @Get("organizations/:organizationId") organization(
    @Param("organizationId") id: string,
  ) {
    return this.kernel.getOrganization(id);
  }
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
