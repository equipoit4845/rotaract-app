import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";

import { KernelService } from "../../application/kernel/kernel.service";
import { HttpCommandContextFactory } from "./command-context.factory";

@Controller()
export class AuthorizationController {
  constructor(
    private readonly kernel: KernelService,
    private readonly contexts: HttpCommandContextFactory,
  ) {}
  @Get("permissions") permissions() {
    return this.kernel.listPermissions();
  }
  @Post("permissions") createPermission(
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.createPermission(
      body,
      this.contexts.from(request, "registerPermission"),
    );
  }
  @Get("roles") roles() {
    return this.kernel.listRoles();
  }
  @Post("roles") createRole(@Body() body: any, @Req() request: Request) {
    return this.kernel.createRole(
      body,
      this.contexts.from(request, "createRole"),
    );
  }
  @Put("roles/:roleId/permissions/:permissionId") attachPermission(
    @Param("roleId") roleId: string,
    @Param("permissionId") permissionId: string,
    @Req() request: Request,
  ) {
    return this.kernel.rolePermission(
      roleId,
      permissionId,
      true,
      this.contexts.from(request, "attachPermissionToRole"),
    );
  }
  @Delete("roles/:roleId/permissions/:permissionId") detachPermission(
    @Param("roleId") roleId: string,
    @Param("permissionId") permissionId: string,
    @Req() request: Request,
  ) {
    return this.kernel.rolePermission(
      roleId,
      permissionId,
      false,
      this.contexts.from(request, "detachPermissionFromRole"),
    );
  }
  @Post("role-assignments") grantRole(
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.grantRole(
      body,
      this.contexts.from(request, "grantRole"),
    );
  }
  @Get("role-assignments") listAssignments(@Query() query: any) {
    return this.kernel.listRoleAssignments(query);
  }
  @Post("role-assignments/:assignmentId/revoke") revokeRole(
    @Param("assignmentId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.revokeRole(
      id,
      this.contexts.from(request, "revokeRole"),
    );
  }
  @Post("authorization/check") check(@Body() body: any) {
    return this.kernel.checkAuthorization(body);
  }
  @Post("authorization/batch-check") batch(@Body() body: any) {
    return this.kernel.batchCheckAuthorization(body);
  }
  @Get("persons/:personId/effective-permissions") effective(
    @Param("personId") personId: string,
    @Query() query: any,
  ) {
    return this.kernel.effectivePermissions(personId, query);
  }
}
