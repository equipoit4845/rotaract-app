"""Views of the data API v1 (kernel-openapi.yaml, tag Service) and OIDC
payloads. Keys keep the API's camelCase spelling: these are the JSON objects
the Kernel returns, typed."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional, TypedDict

OrganizationType = Literal["DISTRICT", "CLUB", "OTHER"]
OrganizationStatus = Literal["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]
MembershipStatus = Literal["PENDING", "ACTIVE", "ON_LEAVE", "INACTIVE", "GRADUATED", "TRANSFERRED"]
PeriodStatus = Literal["DRAFT", "SCHEDULED", "ACTIVE", "CLOSED", "CANCELLED"]
AppointmentStatus = Literal["NOMINATED", "ELECTED", "ACTIVE", "ENDED", "REVOKED"]
ScopeType = Literal["PLATFORM", "ORGANIZATION", "ORGANIZATION_TREE"]


class _OrganizationViewRequired(TypedDict):
    id: str
    type: OrganizationType
    code: str
    name: str
    slug: str
    status: OrganizationStatus
    parentId: Optional[str]
    updatedAt: str


class OrganizationView(_OrganizationViewRequired, total=False):
    countryCode: Optional[str]
    region: Optional[str]
    city: Optional[str]
    timezone: Optional[str]
    logoUrl: Optional[str]
    description: Optional[str]


class _PersonViewRequired(TypedDict):
    id: str
    displayName: str
    firstName: str
    lastName: str
    updatedAt: str


class PersonView(_PersonViewRequired, total=False):
    """``email``, ``phone`` and ``birthDate`` only with ``kernel.service.persons.contact.read``."""

    avatarUrl: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    birthDate: Optional[str]


class _MemberViewRequired(TypedDict):
    membershipId: str
    organizationId: str
    personId: str
    status: MembershipStatus
    person: PersonView
    updatedAt: str


class MemberView(_MemberViewRequired, total=False):
    joinedAt: Optional[str]
    memberNumber: Optional[str]


class AuthorityPerson(TypedDict, total=False):
    id: str
    displayName: str
    avatarUrl: Optional[str]


class _AuthorityViewRequired(TypedDict):
    appointmentId: str
    organizationId: str
    periodId: str
    positionCode: str
    positionName: str
    status: AppointmentStatus
    person: AuthorityPerson


class AuthorityView(_AuthorityViewRequired, total=False):
    startsAt: Optional[str]
    endsAt: Optional[str]


class PeriodView(TypedDict):
    id: str
    organizationId: str
    code: str
    name: str
    status: PeriodStatus
    startDate: str
    endDate: str


class _PersonMembershipViewRequired(TypedDict):
    membershipId: str
    organizationId: str
    organizationName: str
    organizationType: OrganizationType
    status: MembershipStatus


class PersonMembershipView(_PersonMembershipViewRequired, total=False):
    joinedAt: Optional[str]
    endedAt: Optional[str]


class _AuthorizationDecisionRequired(TypedDict):
    allowed: bool
    decisionId: str
    subjectId: str
    permission: str
    evaluatedAt: str


class AuthorizationDecision(_AuthorizationDecisionRequired, total=False):
    matchedAssignments: list[str]
    reasonCodes: list[str]
    cacheUntil: Optional[str]


class UserInfo(TypedDict, total=False):
    sub: str
    name: str
    given_name: str
    family_name: str
    picture: Optional[str]
    email: str
    email_verified: bool
    memberships: list[dict[str, Any]]
    positions: list[dict[str, Any]]


@dataclass
class AuthorizationRequest:
    url: str
    #: Keep it server-side (session) until the callback.
    code_verifier: str
    state: str
    nonce: str


@dataclass
class TokenSet:
    access_token: str
    token_type: str
    expires_in: int
    #: Epoch seconds.
    expires_at: float
    scope: str
    id_token: str | None = None
    refresh_token: str | None = None
    #: Verified ID token claims, when the server returned an id_token.
    claims: dict[str, Any] | None = field(default=None)
