import {
  Body,
  Controller,
  Delete,
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
export class InstitutionalController {
  constructor(
    private readonly kernel: KernelService,
    private readonly contexts: HttpCommandContextFactory,
  ) {}
  @Post("persons") createPerson(@Body() body: any, @Req() request: Request) {
    return this.kernel.createPerson(
      body,
      this.contexts.from(request, "createPerson"),
    );
  }
  @Get("persons") listPersons(@Query() query: any) {
    return this.kernel.listPersons(query);
  }
  @Get("persons/:personId") person(@Param("personId") id: string) {
    return this.kernel.getPerson(id);
  }
  @Patch("persons/:personId") updatePerson(
    @Param("personId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.updatePerson(
      id,
      body,
      this.contexts.from(request, "updatePerson"),
    );
  }
  @Post("persons/:personId/archive") archivePerson(
    @Param("personId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.archivePerson(
      id,
      this.contexts.from(request, "archivePerson"),
    );
  }
  @Post("persons/:personId/invitations") invitePerson(
    @Param("personId") id: string,
    @Body() body: { membershipId: string; email: string },
    @Req() request: Request,
  ) {
    return this.kernel.invitePerson(
      id,
      body,
      this.contexts.from(request, "invitePersonToCreateAccount"),
    );
  }

  @Post("organizations/:organizationId/memberships") createMembership(
    @Param("organizationId") organizationId: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.createMembership(
      organizationId,
      body,
      this.contexts.from(request, "createMembership"),
    );
  }
  @Get("organizations/:organizationId/memberships") listMemberships(
    @Param("organizationId") organizationId: string,
    @Query() query: any,
  ) {
    return this.kernel.listMemberships(organizationId, query);
  }
  @Get("memberships/:membershipId") membership(
    @Param("membershipId") id: string,
  ) {
    return this.kernel.getMembership(id);
  }
  @Patch("memberships/:membershipId") updateMembership(
    @Param("membershipId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.updateMembership(
      id,
      body,
      this.contexts.from(request, "updateMembership"),
    );
  }
  @Post("memberships/:membershipId/activate") membershipActivate(
    @Param("membershipId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.transitionMembership(
      id,
      "ACTIVE",
      "ACTIVATED",
      body,
      this.contexts.from(request, "activateMembership"),
    );
  }
  @Post("memberships/:membershipId/leave") membershipLeave(
    @Param("membershipId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.transitionMembership(
      id,
      "ON_LEAVE",
      "LEAVE_STARTED",
      body,
      this.contexts.from(request, "putMembershipOnLeave"),
    );
  }
  @Post("memberships/:membershipId/resume") membershipResume(
    @Param("membershipId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.transitionMembership(
      id,
      "ACTIVE",
      "LEAVE_ENDED",
      body,
      this.contexts.from(request, "resumeMembership"),
    );
  }
  @Post("memberships/:membershipId/deactivate") membershipDeactivate(
    @Param("membershipId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.transitionMembership(
      id,
      "INACTIVE",
      "DEACTIVATED",
      body,
      this.contexts.from(request, "deactivateMembership"),
    );
  }
  @Post("memberships/:membershipId/graduate") membershipGraduate(
    @Param("membershipId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.transitionMembership(
      id,
      "GRADUATED",
      "GRADUATED",
      body,
      this.contexts.from(request, "graduateMembership"),
    );
  }
  @Post("memberships/:membershipId/reactivate") membershipReactivate(
    @Param("membershipId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.transitionMembership(
      id,
      "ACTIVE",
      "REACTIVATED",
      body,
      this.contexts.from(request, "reactivateMembership"),
    );
  }
  @Get("memberships/:membershipId/history") history(
    @Param("membershipId") id: string,
  ) {
    return this.kernel.membershipHistory(id);
  }
  @Get("persons/:personId/memberships") membershipsForPerson(
    @Param("personId") id: string,
  ) {
    return this.kernel.personMemberships(id);
  }

  @Post("organizations/:organizationId/periods") createPeriod(
    @Param("organizationId") organizationId: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.createPeriod(
      organizationId,
      body,
      this.contexts.from(request, "createPeriod"),
    );
  }
  @Get("organizations/:organizationId/periods") listPeriods(
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.listPeriods(organizationId);
  }
  @Get("organizations/:organizationId/periods/current") currentPeriod(
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.currentPeriod(organizationId);
  }
  @Get("periods/:periodId") period(@Param("periodId") id: string) {
    return this.kernel.getPeriod(id);
  }
  @Patch("periods/:periodId") updatePeriod(
    @Param("periodId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.updatePeriod(
      id,
      body,
      this.contexts.from(request, "updateDraftPeriod"),
    );
  }
  @Post("periods/:periodId/schedule") schedule(
    @Param("periodId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionPeriod(
      id,
      "SCHEDULED",
      this.contexts.from(request, "schedulePeriod"),
    );
  }
  @Post("periods/:periodId/activate") activatePeriod(
    @Param("periodId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionPeriod(
      id,
      "ACTIVE",
      this.contexts.from(request, "activatePeriod"),
    );
  }
  @Post("periods/:periodId/close") closePeriod(
    @Param("periodId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionPeriod(
      id,
      "CLOSED",
      this.contexts.from(request, "closePeriod"),
    );
  }
  @Post("periods/:periodId/cancel") cancelPeriod(
    @Param("periodId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionPeriod(
      id,
      "CANCELLED",
      this.contexts.from(request, "cancelPeriod"),
    );
  }

  @Post("position-definitions") createPosition(
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.createPosition(
      body,
      this.contexts.from(request, "createPositionDefinition"),
    );
  }
  @Get("position-definitions") listPositions(@Query() query: any) {
    return this.kernel.listPositions(query);
  }
  @Patch("position-definitions/:positionDefinitionId") updatePosition(
    @Param("positionDefinitionId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.updatePosition(
      id,
      body,
      this.contexts.from(request, "updatePositionDefinition"),
    );
  }
  @Put("position-definitions/:positionDefinitionId/permissions/:permissionId")
  attachPositionPermission(
    @Param("positionDefinitionId") id: string,
    @Param("permissionId") permissionId: string,
    @Req() request: Request,
  ) {
    return this.kernel.positionPermission(
      id,
      permissionId,
      true,
      this.contexts.from(request, "attachPermissionToPosition"),
    );
  }
  @Delete(
    "position-definitions/:positionDefinitionId/permissions/:permissionId",
  )
  detachPositionPermission(
    @Param("positionDefinitionId") id: string,
    @Param("permissionId") permissionId: string,
    @Req() request: Request,
  ) {
    return this.kernel.positionPermission(
      id,
      permissionId,
      false,
      this.contexts.from(request, "detachPermissionFromPosition"),
    );
  }
  @Post("organizations/:organizationId/appointments") createAppointment(
    @Param("organizationId") organizationId: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.createAppointment(
      organizationId,
      body,
      this.contexts.from(request, "createAppointment"),
    );
  }
  @Get("organizations/:organizationId/appointments") listAppointments(
    @Param("organizationId") organizationId: string,
    @Query() query: any,
  ) {
    return this.kernel.listAppointments(organizationId, query);
  }
  @Get("organizations/:organizationId/authorities/current") currentAuthorities(
    @Param("organizationId") organizationId: string,
  ) {
    return this.kernel.currentAuthorities(organizationId);
  }
  @Get("appointments/:appointmentId") appointment(
    @Param("appointmentId") id: string,
  ) {
    return this.kernel.getAppointment(id);
  }
  @Post("appointments/:appointmentId/elect") elect(
    @Param("appointmentId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionAppointment(
      id,
      "ELECTED",
      {},
      this.contexts.from(request, "markAppointmentElected"),
    );
  }
  @Post("appointments/:appointmentId/activate") activateAppointment(
    @Param("appointmentId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionAppointment(
      id,
      "ACTIVE",
      {},
      this.contexts.from(request, "activateAppointment"),
    );
  }
  @Post("appointments/:appointmentId/end") endAppointment(
    @Param("appointmentId") id: string,
    @Req() request: Request,
  ) {
    return this.kernel.transitionAppointment(
      id,
      "ENDED",
      {},
      this.contexts.from(request, "endAppointment"),
    );
  }
  @Post("appointments/:appointmentId/revoke") revokeAppointment(
    @Param("appointmentId") id: string,
    @Body() body: any,
    @Req() request: Request,
  ) {
    return this.kernel.transitionAppointment(
      id,
      "REVOKED",
      body,
      this.contexts.from(request, "revokeAppointment"),
    );
  }
}
