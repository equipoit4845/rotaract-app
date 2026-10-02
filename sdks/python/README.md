# mirotaract (Python)

SDK oficial de **Mi Rotaract** para Python ≥ 3.10:

- **API de datos institucionales** (clubes, socios, autoridades, períodos,
  permisos) con `client_credentials`: `MiRotaract` (síncrono) y
  `AsyncMiRotaract` (asíncrono).
- **Ingresar con Mi Rotaract** (OAuth 2.0 + PKCE + OpenID Connect):
  `MiRotaractAuth` y `AsyncMiRotaractAuth`, con verificación del `id_token`
  contra el JWKS publicado.
- Dependencia para **FastAPI**: `mirotaract.fastapi.require_user`.

Dependencias: `httpx` y `PyJWT[crypto]`.

```bash
pip install mirotaract            # o "mirotaract[fastapi]"
```

La URL base es la de la API del kernel, que además es el _issuer_ OIDC:
`https://api.rotaract4845.com/api/kernel/v1`. El resto se descubre desde
`/.well-known/openid-configuration`.

## 1. Cliente de servidor (API de datos)

```python
import os
from mirotaract import MiRotaract

mr = MiRotaract(
    os.environ["MIROTARACT_BASE_URL"],
    os.environ["MIROTARACT_CLIENT_ID"],      # mra_…
    os.environ["MIROTARACT_CLIENT_SECRET"],  # mrs_…
)

for club in mr.clubs.list(status="ACTIVE", type="CLUB"):  # sigue nextCursor solo
    print(club["name"])

socios = mr.members.list(club_id, status="ACTIVE").all()
club = mr.clubs.get(club_id)
personas = mr.persons.batch(ids)                 # de a 100, automático
membresias = mr.persons.memberships(person_id)
autoridades = mr.authorities.list(distrito_id, include_descendants=True)
periodos = mr.periods.list(club_id, status="ACTIVE")
decision = mr.permissions.check(
    person_id=person_id, permission="meetings.meeting.create", organization_id=club_id
)
```

Asíncrono, misma superficie:

```python
from mirotaract import AsyncMiRotaract

async with AsyncMiRotaract(base_url, client_id, client_secret) as mr:
    async for socio in mr.members.list(club_id, limit=100):
        ...
    club = await mr.clubs.get(club_id)
```

| Recurso | Métodos |
|---|---|
| `clubs` (alias `organizations`) | `list(type=, status=, parent_id=, updated_since=, limit=, if_none_match=)`, `get(id)` |
| `members` | `list(organization_id, status=, updated_since=, limit=, if_none_match=)` |
| `persons` | `get(id)`, `batch(ids)`, `memberships(person_id)` |
| `authorities` | `list(organization_id, include_descendants=)` |
| `periods` | `list(organization_id, status=)` |
| `permissions` | `check(person_id=, permission=, organization_id=, scope_type=, period_id=, resource=)`, `check_many([...])` |

Otros: `get_access_token()`, `granted_scopes`, `clear_token()`, `discovery()`
y `request(method, path, params=, json=)`.

Las vistas son `TypedDict` con las claves tal como las devuelve la API
(`displayName`, `updatedAt`…): `OrganizationView`, `MemberView`,
`PersonView`, `AuthorityView`, `PeriodView`, `PersonMembershipView`,
`AuthorizationDecision`.

### Comportamiento

- Token de servicio cacheado hasta 60 s antes de vencer (con lock, una sola
  renovación aunque haya concurrencia); ante un 401 se renueva una vez.
- Reintentos (2 por defecto) con backoff exponencial y jitter ante
  429/502/503/504 y errores de red, respetando `Retry-After`. Nunca reintenta
  un `POST` sin `Idempotency-Key`; las lecturas por POST (`persons.batch`,
  `permissions.check`) mandan una clave propia.
- Paginadores: iteración, `.all(max=)`, `.pages()` y `.page(cursor)`.
- Podés pasar tu propio `httpx.Client` / `httpx.AsyncClient` (`http_client=`)
  para proxies, timeouts o pruebas con `httpx.MockTransport`.

### ETag (sincronización incremental)

```python
page = mr.members.list(club_id).page()
guardar(page.items, page.etag)

again = mr.members.list(club_id, if_none_match=etag_guardado).page()
if again.not_modified:   # 304: nada cambió
    return
```

`if_none_match` aplica a la primera página; con 304, `.page()` devuelve
`NotModified(etag=…)`, la iteración no produce elementos y
`paginator.not_modified` queda en `True`.

### Errores

```python
from mirotaract import MiRotaractApiError, MiRotaractOAuthError

try:
    mr.members.list(otro_club).all()
except MiRotaractApiError as e:      # Problem Details
    e.status, e.code, e.title, e.detail, e.trace_id   # 403, "KERNEL_HTTP_403", …
except MiRotaractOAuthError as e:    # RFC 6749
    e.error, e.error_description                      # "invalid_client", …
```

## 2. Ingresar con Mi Rotaract

```python
from mirotaract import MiRotaractAuth

auth = MiRotaractAuth(
    "https://api.rotaract4845.com/api/kernel/v1",
    client_id="mra_…",
    redirect_uri="https://mi-app.org/auth/callback",
    client_secret="mrs_…",            # None para apps PUBLIC
    scope="openid profile email memberships",
)

# 1) Login: guardá code_verifier, state y nonce en la sesión del servidor
req = auth.authorization_url()
session["mr"] = {"verifier": req.code_verifier, "state": req.state, "nonce": req.nonce}
return redirect(req.url)

# 2) Callback
code = auth.parse_callback(str(request.url), session["mr"]["state"])
tokens = auth.exchange_code(code, session["mr"]["verifier"], nonce=session["mr"]["nonce"])
tokens.claims            # id_token verificado: sub, name, email, memberships…
tokens.refresh_token

# 3) Después
auth.user_info(tokens.access_token)
nuevos = auth.refresh(tokens.refresh_token)   # rota: guardá el nuevo
auth.revoke(nuevos.refresh_token)
```

Métodos: `discovery()`, `authorization_url(scope=, state=, nonce=, redirect_uri=, extra_params=)`,
`parse_callback(url, state)`, `exchange_code(code, code_verifier, nonce=)`,
`refresh(refresh_token, scope=)`, `verify_id_token(id_token, nonce=, max_age=)`,
`verify_access_token(token)`, `user_info(access_token)`, `revoke(token)`.
`AsyncMiRotaractAuth` tiene los mismos métodos con `await`.

El JWKS se descarga con el mismo cliente `httpx` (no con `urllib`), se
construye con `jwt.PyJWKSet`, se cachea 10 minutos y se vuelve a pedir ante un
`kid` desconocido. Se verifica ES256, `iss`, `aud` (= `client_id`), `exp`,
`azp` y `nonce`.

## 3. FastAPI

```python
from fastapi import Depends, FastAPI
from mirotaract import AsyncMiRotaractAuth
from mirotaract.fastapi import require_user

auth = AsyncMiRotaractAuth(ISSUER, CLIENT_ID, REDIRECT_URI)
current_user = require_user(auth)               # verify="userinfo" (por defecto) o "jwt"

app = FastAPI()

@app.get("/api/yo")
async def yo(user=Depends(current_user)):
    return user
```

- `verify="userinfo"`: consulta `/oauth/userinfo` (ve revocaciones al
  instante); cachea `cache_ttl` segundos (60).
- `verify="jwt"`: verificación local de la firma, sin red por pedido.
- `authorize=lambda user: …` devuelve 403 si da `False`.
- Sin token o inválido: `401` con `WWW-Authenticate: Bearer error="invalid_token"`.

Para apps web con páginas del servidor conviene una sesión del lado del
servidor: hacé el login con `authorization_url` / `exchange_code` y guardá
`tokens.claims` en tu sesión.

## Conformidad

```bash
python3 -m venv .venv && .venv/bin/pip install -e 'sdks/python[dev]'
KERNEL_DATABASE_URL=… MR_BASE_URL=http://127.0.0.1:3911/api/kernel/v1 node sdks/conformance/seed.mjs > /tmp/mr.env
.venv/bin/python sdks/conformance/run_python.py --env-file /tmp/mr.env
```

## Desarrollo

```bash
.venv/bin/pip install -e 'sdks/python[dev]'
.venv/bin/python -m pytest sdks/python
```
