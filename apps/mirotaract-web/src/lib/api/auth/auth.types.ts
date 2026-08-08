import type { components } from "../client/schema";

export type UserContext = components["schemas"]["UserContext"];
export type UserAccount = components["schemas"]["UserAccount"];
export type AuthTokens = components["schemas"]["AuthTokens"];
export type LoginRequest = components["schemas"]["LoginRequest"];
export type RegisterAccountRequest =
  components["schemas"]["RegisterAccountRequest"];
export type AcceptAccountInvitationRequest =
  components["schemas"]["AcceptAccountInvitationRequest"];
export type AccountSession = components["schemas"]["AccountSession"];
