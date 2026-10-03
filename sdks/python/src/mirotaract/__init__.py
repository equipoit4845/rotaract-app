"""SDK oficial de Mi Rotaract.

- ``MiRotaract`` / ``AsyncMiRotaract``: API de datos institucionales
  (client_credentials, solo servidor).
- ``MiRotaractAuth`` / ``AsyncMiRotaractAuth``: "Ingresar con Mi Rotaract"
  (OAuth 2.0 + PKCE + OpenID Connect).
- ``mirotaract.fastapi.require_user``: dependencia para FastAPI.
- ``verify_webhook``: verifica la firma de un webhook de Mi Rotaract.
"""

from ._http import SDK_VERSION
from .auth import (
    KERNEL_AUDIENCE,
    AsyncMiRotaractAuth,
    MiRotaractAuth,
    pkce_challenge,
    random_token,
)
from .client import AsyncMiRotaract, MiRotaract
from .errors import (
    MiRotaractApiError,
    MiRotaractConfigError,
    MiRotaractError,
    MiRotaractOAuthError,
    MiRotaractRateLimitError,
)
from .webhooks import (
    MiRotaractWebhookError,
    verify_webhook,
)
from .pagination import AsyncPaginator, NotModified, Page, SyncPaginator
from .types import (
    AuthorityView,
    AuthorizationDecision,
    AuthorizationRequest,
    MemberView,
    OrganizationView,
    PeriodView,
    PersonMembershipView,
    PersonView,
    TokenSet,
    UserInfo,
)

__version__ = SDK_VERSION

__all__ = [
    "SDK_VERSION",
    "KERNEL_AUDIENCE",
    "MiRotaract",
    "AsyncMiRotaract",
    "MiRotaractAuth",
    "AsyncMiRotaractAuth",
    "MiRotaractError",
    "MiRotaractApiError",
    "MiRotaractOAuthError",
    "MiRotaractRateLimitError",
    "MiRotaractConfigError",
    "MiRotaractWebhookError",
    "verify_webhook",
    "Page",
    "NotModified",
    "SyncPaginator",
    "AsyncPaginator",
    "AuthorizationRequest",
    "TokenSet",
    "OrganizationView",
    "PersonView",
    "MemberView",
    "AuthorityView",
    "PeriodView",
    "PersonMembershipView",
    "AuthorizationDecision",
    "UserInfo",
    "pkce_challenge",
    "random_token",
]
