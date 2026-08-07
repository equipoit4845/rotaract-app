import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { KernelService } from "../../application/kernel/kernel.service";
import { HttpCommandContextFactory } from "./command-context.factory";

@Controller()
export class WorkflowController {
  constructor(
    private readonly kernel: KernelService,
    private readonly contexts: HttpCommandContextFactory,
  ) {}
  @Post("membership-applications") createApplication(
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.createApplication(
      body,
      this.contexts.from(request, "createMembershipApplication"),
    );
  }
  @Get("membership-applications") listApplications(@Query() query: any) {
    return this.kernel.listApplications(query);
  }
  @Get("membership-applications/:applicationId") application(
    @Param("applicationId") id: string,
  ) {
    return this.kernel.getApplication(id);
  }
  @Post("membership-applications/:applicationId/submit") submit(
    @Param("applicationId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionApplication(
      id,
      "SUBMITTED",
      {},
      this.contexts.from(request, "submitMembershipApplication"),
    );
  }
  @Post("membership-applications/:applicationId/approve") approve(
    @Param("applicationId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionApplication(
      id,
      "APPROVED",
      {},
      this.contexts.from(request, "approveMembershipApplication"),
    );
  }
  @Post("membership-applications/:applicationId/reject") reject(
    @Param("applicationId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.transitionApplication(
      id,
      "REJECTED",
      body,
      this.contexts.from(request, "rejectMembershipApplication"),
    );
  }
  @Post("membership-applications/:applicationId/cancel") cancelApplication(
    @Param("applicationId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionApplication(
      id,
      "CANCELLED",
      {},
      this.contexts.from(request, "cancelMembershipApplication"),
    );
  }

  @Post("membership-transfers") requestTransfer(
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.requestTransfer(
      body,
      this.contexts.from(request, "requestMembershipTransfer"),
    );
  }
  @Get("membership-transfers") listTransfers(@Query() query: any) {
    return this.kernel.listTransfers(query);
  }
  @Get("membership-transfers/:transferId") transfer(
    @Param("transferId") id: string,
  ) {
    return this.kernel.getTransfer(id);
  }
  @Post("membership-transfers/:transferId/accept") accept(
    @Param("transferId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionTransfer(
      id,
      "ACCEPTED_BY_DESTINATION",
      {},
      this.contexts.from(request, "acceptTransferByDestination"),
    );
  }
  @Post("membership-transfers/:transferId/confirm") confirm(
    @Param("transferId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionTransfer(
      id,
      "CONFIRMED_BY_ORIGIN",
      {},
      this.contexts.from(request, "confirmTransferByOrigin"),
    );
  }
  @Post("membership-transfers/:transferId/complete") complete(
    @Param("transferId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionTransfer(
      id,
      "COMPLETED",
      {},
      this.contexts.from(request, "completeMembershipTransfer"),
    );
  }
  @Post("membership-transfers/:transferId/reject") rejectTransfer(
    @Param("transferId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.transitionTransfer(
      id,
      "REJECTED",
      body,
      this.contexts.from(request, "rejectMembershipTransfer"),
    );
  }
  @Post("membership-transfers/:transferId/cancel") cancelTransfer(
    @Param("transferId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionTransfer(
      id,
      "CANCELLED",
      {},
      this.contexts.from(request, "cancelMembershipTransfer"),
    );
  }

  @Post("modules") createModule(@Body() body: any, @Req() request: Request) {
    return this.kernel.registerModule(
      body,
      this.contexts.from(request, "registerModule"),
    );
  }
  @Get("modules") modules() {
    return this.kernel.listModules();
  }
  @Get("modules/:moduleId") module(@Param("moduleId") id: string) {
    return this.kernel.getModule(id);
  }
  @Put("modules/:moduleId/manifest") manifest(
    @Param("moduleId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.updateModuleManifest(
      id,
      body,
      this.contexts.from(request, "updateModuleManifest"),
    );
  }
  @Post("modules/:moduleId/deprecate") deprecate(
    @Param("moduleId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.deprecateModule(
      id,
      this.contexts.from(request, "deprecateModule"),
    );
  }
  @Post("organizations/:organizationId/modules/:moduleId/install") install(
    @Param("organizationId") organizationId: string,
    @Param("moduleId") moduleId: string,
    @Req() request: Request,
  ) {
    return this.kernel.installModule(
      organizationId,
      moduleId,
      this.contexts.from(request, "installModule"),
    );
  }
  @Post("organizations/:organizationId/modules/:moduleId/activate")
  activateInstall(
    @Param("organizationId") organizationId: string,
    @Param("moduleId") moduleId: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionInstallation(
      organizationId,
      moduleId,
      "ACTIVE",
      this.contexts.from(request, "activateModuleInstallation"),
    );
  }
  @Patch("organizations/:organizationId/modules/:moduleId/configuration")
  config(
    @Param("organizationId") organizationId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.updateInstallationConfiguration(
      organizationId,
      moduleId,
      body.configuration ?? body,
      this.contexts.from(request, "updateModuleConfiguration"),
    );
  }
  @Post("organizations/:organizationId/modules/:moduleId/suspend") suspend(
    @Param("organizationId") organizationId: string,
    @Param("moduleId") moduleId: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionInstallation(
      organizationId,
      moduleId,
      "SUSPENDED",
      this.contexts.from(request, "suspendModuleInstallation"),
    );
  }
  @Post("organizations/:organizationId/modules/:moduleId/disable") disable(
    @Param("organizationId") organizationId: string,
    @Param("moduleId") moduleId: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionInstallation(
      organizationId,
      moduleId,
      "DISABLED",
      this.contexts.from(request, "disableModuleInstallation"),
    );
  }
  @Get("organizations/:organizationId/modules") installations(
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.listInstallations(organizationId);
  }
  @Get("organizations/:organizationId/capabilities") capabilities(
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.capabilities(organizationId);
  }
}
