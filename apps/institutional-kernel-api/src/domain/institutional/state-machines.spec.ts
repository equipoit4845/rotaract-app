import { DomainError } from "../shared/domain.error";
import {
  accountStateMachine,
  applicationStateMachine,
  appointmentStateMachine,
  installationStateMachine,
  membershipStateMachine,
  periodStateMachine,
  transferStateMachine,
} from "./state-machines";
import {
  assertDistrictMembership,
  assertRotaryPeriod,
  assertScope,
} from "./invariants";

describe("institutional domain", () => {
  it("only activates an elected appointment", () => {
    appointmentStateMachine.assertTransition("ELECTED", "ACTIVE");
    expect(() =>
      appointmentStateMachine.assertTransition("NOMINATED", "ACTIVE"),
    ).toThrow(DomainError);
  });
  it("keeps completed transfers terminal", () =>
    expect(() =>
      transferStateMachine.assertTransition("COMPLETED", "CANCELLED"),
    ).toThrow(DomainError));
  it("does not reopen a closed period", () =>
    expect(() =>
      periodStateMachine.assertTransition("CLOSED", "ACTIVE"),
    ).toThrow(DomainError));
  it("allows membership leave and return", () => {
    membershipStateMachine.assertTransition("ACTIVE", "ON_LEAVE");
    membershipStateMachine.assertTransition("ON_LEAVE", "ACTIVE");
  });
  it("requires a July-to-June rotary period", () => {
    assertRotaryPeriod(
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2027-06-30T00:00:00.000Z"),
    );
    expect(() =>
      assertRotaryPeriod(
        new Date("2026-01-01T00:00:00.000Z"),
        new Date("2026-12-31T00:00:00.000Z"),
      ),
    ).toThrow(DomainError);
  });
  it("keeps identity and applications in their normative state machines", () => {
    accountStateMachine.assertTransition("PENDING_VERIFICATION", "ACTIVE");
    applicationStateMachine.assertTransition("SUBMITTED", "APPROVED");
    expect(() =>
      accountStateMachine.assertTransition("DISABLED", "ACTIVE"),
    ).toThrow(DomainError);
    expect(() =>
      applicationStateMachine.assertTransition("APPROVED", "CANCELLED"),
    ).toThrow(DomainError);
  });
  it("allows only documented module installation transitions", () => {
    installationStateMachine.assertTransition("PENDING", "ACTIVE");
    expect(() =>
      installationStateMachine.assertTransition("DISABLED", "ACTIVE"),
    ).toThrow(DomainError);
  });
  it("enforces assignment scopes and district appointment membership", () => {
    assertScope("PLATFORM");
    assertScope("ORGANIZATION", "org");
    assertDistrictMembership("DISTRICT", "district", "club", "CLUB", true);
    expect(() => assertScope("PLATFORM", "org")).toThrow(DomainError);
    expect(() =>
      assertDistrictMembership("DISTRICT", "district", "other", "OTHER", true),
    ).toThrow(DomainError);
  });
});
