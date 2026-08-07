import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { KernelService } from "../../application/kernel/kernel.service";
import { HttpCommandContextFactory } from "./command-context.factory";

@Controller()
export class OrganizationsController {
  constructor(
    private readonly kernel: KernelService,
    private readonly contexts: HttpCommandContextFactory,
  ) {}
  @Post("organizations") create(@Body() body: any, @Req() request: Request) {
    return this.kernel.createOrganization(
      body,
      this.contexts.from(request, "createOrganization"),
    );
  }
  @Get("organizations") list(@Query() query: any) {
    return this.kernel.listOrganizations(query);
  }
  @Get("organizations/:organizationId") get(
    @Param("organizationId") id: string,
  ) {
    return this.kernel.getOrganization(id);
  }
  @Patch("organizations/:organizationId") update(
    @Param("organizationId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.updateOrganization(
      id,
      body,
      this.contexts.from(request, "updateOrganization"),
    );
  }
  @Post("organizations/:organizationId/activate") activate(
    @Param("organizationId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionOrganization(
      id,
      "ACTIVE",
      this.contexts.from(request, "activateOrganization"),
    );
  }
  @Post("organizations/:organizationId/deactivate") deactivate(
    @Param("organizationId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionOrganization(
      id,
      "INACTIVE",
      this.contexts.from(request, "deactivateOrganization"),
    );
  }
  @Post("organizations/:organizationId/archive") archive(
    @Param("organizationId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionOrganization(
      id,
      "ARCHIVED",
      this.contexts.from(request, "archiveOrganization"),
    );
  }
  @Post("organizations/:organizationId/move") move(
    @Param("organizationId") id: string,
    @Body() body: { parentId: string },
    @Req() request: Request,
  ) {
    return this.kernel.moveOrganization(
      id,
      body.parentId,
      this.contexts.from(request, "moveOrganization"),
    );
  }
  @Get("organizations/:organizationId/children") children(
    @Param("organizationId") id: string,
  ) {
    return this.kernel.children(id);
  }
  @Get("organizations/:organizationId/ancestors") ancestors(
    @Param("organizationId") id: string,
  ) {
    return this.kernel.ancestors(id);
  }
  @Get("organizations/:organizationId/descendants") descendants(
    @Param("organizationId") id: string,
  ) {
    return this.kernel.descendants(id);
  }
}
