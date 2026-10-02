#!/usr/bin/env python3
"""Conformance runner for the ``mirotaract`` Python SDK.

Runs every scenario of scenarios.json against a real, disposable Kernel.
Env: see scenarios.json (``node sdks/conformance/seed.mjs`` prints them).

    .venv/bin/python sdks/conformance/run_python.py [--env-file FILE] [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx

from mirotaract import (
    MiRotaract,
    MiRotaractApiError,
    MiRotaractAuth,
    MiRotaractOAuthError,
)

SCOPE = "openid profile email memberships positions"
HERE = Path(__file__).resolve().parent


class Skip(Exception):
    pass


def load_env_file(path: str) -> None:
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.removeprefix("export ").partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def env(name: str) -> str | None:
    return os.environ.get(name) or None


def need(*names: str) -> None:
    for name in names:
        if not env(name):
            raise Skip(f"falta {name}")


def check(condition: object, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def expect_error(fn, predicate, label: str):
    try:
        fn()
    except Exception as error:  # noqa: BLE001
        if predicate(error):
            return error
        # A missing endpoint must surface as such (→ PENDING for unmerged epics).
        if isinstance(error, MiRotaractApiError) and error.status == 404:
            raise
        raise AssertionError(f"se esperaba {label}, llegó {type(error).__name__}: {error}") from error
    raise AssertionError(f"se esperaba {label}, no hubo error")


def is_oauth(code: str):
    return lambda e: isinstance(e, MiRotaractOAuthError) and e.error == code


def is_api(status: int):
    return lambda e: isinstance(e, MiRotaractApiError) and e.status == status


class Runner:
    def __init__(self) -> None:
        self.base = (env("MR_BASE_URL") or "").rstrip("/")
        self.token_requests = 0
        self._user_token: str | None = None
        self._client: MiRotaract | None = None

    # --- factories -----------------------------------------------------------

    def _count(self, request: httpx.Request) -> None:
        if request.url.path.endswith("/oauth/token"):
            self.token_requests += 1

    def new_client(self, secret: str | None = None) -> MiRotaract:
        return MiRotaract(
            self.base,
            env("MR_CLIENT_ID") or "",
            secret or env("MR_CLIENT_SECRET") or "",
            http_client=httpx.Client(timeout=30, event_hooks={"request": [self._count]}),
        )

    @property
    def client(self) -> MiRotaract:
        if self._client is None:
            self._client = self.new_client()
        return self._client

    def new_auth(self, public: bool = False) -> MiRotaractAuth:
        return MiRotaractAuth(
            self.base,
            env("MR_PUBLIC_CLIENT_ID" if public else "MR_CLIENT_ID") or "",
            env("MR_REDIRECT_URI") or "",
            None if public else env("MR_CLIENT_SECRET"),
            scope=SCOPE,
        )

    # --- drives the consent like the Web does ----------------------------------

    def person_token(self) -> str:
        if self._user_token:
            return self._user_token
        if env("MR_USER_EMAIL") and env("MR_USER_PASSWORD"):
            response = httpx.post(
                f"{self.base}/auth/login",
                json={"email": env("MR_USER_EMAIL"), "password": env("MR_USER_PASSWORD")},
            )
            if response.is_success:
                self._user_token = response.json()["accessToken"]
                return self._user_token
        need("MR_USER_ACCESS_TOKEN")
        self._user_token = env("MR_USER_ACCESS_TOKEN")
        return self._user_token  # type: ignore[return-value]

    def authorize(self, auth: MiRotaractAuth) -> tuple[str, str, str]:
        need("MR_REDIRECT_URI")
        request = auth.authorization_url(scope=SCOPE)
        params = {k: v[-1] for k, v in parse_qs(urlsplit(request.url).query).items()}
        headers = {"authorization": f"Bearer {self.person_token()}"}
        context = httpx.get(f"{self.base}/oauth/authorize/context?{urlencode(params)}", headers=headers)
        check(context.is_success, f"GET /oauth/authorize/context → {context.status_code} {context.text}")
        decision = httpx.post(
            f"{self.base}/oauth/authorize",
            headers=headers,
            json={
                "clientId": params["client_id"],
                "redirectUri": params["redirect_uri"],
                "scope": params["scope"],
                "state": params["state"],
                "nonce": params["nonce"],
                "codeChallenge": params["code_challenge"],
                "codeChallengeMethod": params["code_challenge_method"],
                "decision": "approve",
            },
        )
        check(decision.is_success, f"POST /oauth/authorize → {decision.status_code} {decision.text}")
        code = auth.parse_callback(decision.json()["redirectTo"], request.state)
        return code, request.code_verifier, request.nonce

    def login(self, auth: MiRotaractAuth | None = None):
        auth = auth or self.new_auth()
        code, verifier, nonce = self.authorize(auth)
        return auth, code, verifier, nonce, auth.exchange_code(code, verifier, nonce=nonce)

    # --- scenarios -------------------------------------------------------------

    def discovery(self) -> None:
        config = self.new_auth().discovery()
        check(config["issuer"].rstrip("/") == self.base, f"issuer {config['issuer']} != {self.base}")
        check(config.get("token_endpoint") and config.get("jwks_uri") and config.get("authorization_endpoint"), "faltan endpoints")
        check("S256" in (config.get("code_challenge_methods_supported") or []), "sin S256")

    def client_credentials_token_cached(self) -> None:
        self._client = self.new_client()
        self.token_requests = 0
        self.client.clubs.get(env("MR_ORG_ID"))
        self.client.clubs.get(env("MR_ORG_ID"))
        check(self.token_requests == 1, f"token pedido {self.token_requests} veces")

    def client_credentials_invalid_secret(self) -> None:
        bad = self.new_client(secret="mrs_definitely-not-the-secret")
        expect_error(lambda: bad.clubs.get(env("MR_ORG_ID")), is_oauth("invalid_client"), "invalid_client")

    def clubs_get_in_scope(self) -> None:
        club = self.client.clubs.get(env("MR_ORG_ID"))
        check(club["id"] == env("MR_ORG_ID"), f"id {club['id']}")

    def scope_out_of_scope_org(self) -> None:
        expect_error(lambda: self.client.clubs.get(env("MR_OTHER_ORG_ID")), is_api(403), "403")

    def permissions_check(self) -> None:
        need("MR_PERSON_ID")
        decision = self.client.permissions.check(
            person_id=env("MR_PERSON_ID"), permission="kernel.organization.read", organization_id=env("MR_ORG_ID")
        )
        check(isinstance(decision["allowed"], bool), "allowed no es booleano")
        check(decision["subjectId"] == env("MR_PERSON_ID"), "subjectId distinto")

    def permissions_check_out_of_scope(self) -> None:
        need("MR_PERSON_ID")
        expect_error(
            lambda: self.client.permissions.check(
                person_id=env("MR_PERSON_ID"),
                permission="kernel.organization.read",
                organization_id=env("MR_OTHER_ORG_ID"),
            ),
            is_api(403),
            "403",
        )

    def persons_get_in_scope(self) -> None:
        need("MR_PERSON_ID")
        person = self.client.persons.get(env("MR_PERSON_ID"))
        check(person["id"] == env("MR_PERSON_ID"), f"id {person['id']}")

    def clubs_list_all_pages(self) -> None:
        pages, ids = 0, []
        for page in self.client.clubs.list(limit=1).pages():
            pages += 1
            ids += [o["id"] for o in page.items]
        check(pages > 1 or len(ids) <= 1, f"una sola página con {len(ids)} items")
        check(env("MR_ORG_ID") in ids, "no incluye MR_ORG_ID")
        check(env("MR_OTHER_ORG_ID") not in ids, "incluye una organización fuera del alcance")

    def members_pagination(self) -> None:
        pages, ids = 0, []
        for page in self.client.members.list(env("MR_ORG_ID"), limit=2, updated_since="2000-01-01T00:00:00Z").pages():
            pages += 1
            check(len(page.items) <= 2, "página con más de limit items")
            ids += [m["membershipId"] for m in page.items]
        check(pages >= 3, f"{pages} páginas")
        check(len(ids) >= 5 and len(set(ids)) == len(ids), f"{len(ids)} socios / repetidos")
        future = datetime.now(timezone.utc) + timedelta(days=1)
        check(self.client.members.list(env("MR_ORG_ID"), limit=2, updated_since=future).all() == [], "updatedSince futuro")

    def members_out_of_scope(self) -> None:
        expect_error(lambda: self.client.members.list(env("MR_OTHER_ORG_ID")).all(), is_api(403), "403")

    def members_etag_not_modified(self) -> None:
        first = self.client.members.list(env("MR_ORG_ID")).page()
        check(not first.not_modified and first.etag, "la primera página no trae ETag")
        again = self.client.members.list(env("MR_ORG_ID"), if_none_match=first.etag).page()
        check(again.not_modified, "no devolvió not_modified")
        paginator = self.client.members.list(env("MR_ORG_ID"), if_none_match=first.etag)
        check(paginator.all() == [] and paginator.not_modified, "el iterador produjo elementos")

    def persons_batch(self) -> None:
        need("MR_PERSON_ID", "MR_OUTSIDER_PERSON_ID")
        ids = [p["id"] for p in self.client.persons.batch([env("MR_PERSON_ID"), env("MR_OUTSIDER_PERSON_ID")])]
        check(env("MR_PERSON_ID") in ids, "falta MR_PERSON_ID")
        check(env("MR_OUTSIDER_PERSON_ID") not in ids, "incluye a la persona fuera del alcance")

    def persons_memberships(self) -> None:
        need("MR_PERSON_ID")
        memberships = self.client.persons.memberships(env("MR_PERSON_ID"))
        check(any(m["organizationId"] == env("MR_ORG_ID") for m in memberships), "sin membresía en MR_ORG_ID")

    def authorities_list(self) -> None:
        check(isinstance(self.client.authorities.list(env("MR_ORG_ID")), list), "no es lista")

    def periods_list(self) -> None:
        periods = self.client.periods.list(env("MR_ORG_ID"))
        check(any(p["organizationId"] == env("MR_ORG_ID") for p in periods), "sin períodos")

    def oidc_authorization_url(self) -> None:
        need("MR_REDIRECT_URI")
        auth = self.new_auth()
        request = auth.authorization_url()
        config = auth.discovery()
        check(request.url.startswith(config["authorization_endpoint"]), "no usa authorization_endpoint")
        q = {k: v[-1] for k, v in parse_qs(urlsplit(request.url).query).items()}
        check(q["response_type"] == "code", "response_type")
        check(q["client_id"] == env("MR_CLIENT_ID"), "client_id")
        check(q["redirect_uri"] == env("MR_REDIRECT_URI"), "redirect_uri")
        check(q["code_challenge_method"] == "S256" and len(q["code_challenge"]) == 43, "PKCE")
        check(q["state"] == request.state and q["nonce"] == request.nonce, "state/nonce")
        other = auth.authorization_url()
        check(other.state != request.state and other.code_verifier != request.code_verifier, "no son aleatorios")

    def oidc_code_pkce(self) -> None:
        *_, tokens = self.login()
        check(tokens.claims and tokens.claims.get("sub"), "sin claims")
        if env("MR_PERSON_ID"):
            check(tokens.claims["sub"] == env("MR_PERSON_ID"), f"sub {tokens.claims['sub']}")
        check(tokens.refresh_token and tokens.access_token and tokens.id_token, "faltan tokens")

    def oidc_code_reuse(self) -> None:
        auth, code, verifier, _, _ = self.login()
        expect_error(lambda: auth.exchange_code(code, verifier), is_oauth("invalid_grant"), "invalid_grant")

    def oidc_verify_id_token(self) -> None:
        auth, _, _, nonce, tokens = self.login()
        check(auth.verify_id_token(tokens.id_token, nonce=nonce)["nonce"] == nonce, "nonce")
        expect_error(
            lambda: auth.verify_id_token(tokens.id_token, nonce="otro-nonce"), is_oauth("invalid_token"), "invalid_token"
        )

    def oidc_userinfo(self) -> None:
        auth, *_, tokens = self.login()
        info = auth.user_info(tokens.access_token)
        check(info["sub"] == tokens.claims["sub"], "sub distinto")
        check(isinstance(info.get("email"), str), "sin email")

    def oidc_refresh_rotation(self) -> None:
        auth, *_, tokens = self.login()
        refreshed = auth.refresh(tokens.refresh_token)
        check(refreshed.refresh_token and refreshed.refresh_token != tokens.refresh_token, "no rotó")
        check(refreshed.claims["sub"] == tokens.claims["sub"], "claims distintos")
        expect_error(lambda: auth.refresh(tokens.refresh_token), is_oauth("invalid_grant"), "invalid_grant (reuso)")

    def oidc_revoke(self) -> None:
        auth, *_, tokens = self.login()
        auth.revoke(tokens.refresh_token)
        expect_error(lambda: auth.refresh(tokens.refresh_token), is_oauth("invalid_grant"), "invalid_grant")

    def oidc_public_client(self) -> None:
        need("MR_PUBLIC_CLIENT_ID")
        *_, tokens = self.login(self.new_auth(public=True))
        aud = tokens.claims["aud"]
        check(env("MR_PUBLIC_CLIENT_ID") in (aud if isinstance(aud, list) else [aud]), f"aud {aud}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.env_file:
        load_env_file(args.env_file)

    spec = json.loads((HERE / "scenarios.json").read_text())
    runner = Runner()
    results = []
    for scenario in spec["scenarios"]:
        method = getattr(runner, scenario["id"].replace(".", "_"), None)
        status, detail = "PASS", ""
        try:
            if method is None:
                raise AssertionError("escenario no implementado en este runner")
            need("MR_BASE_URL", "MR_CLIENT_ID", "MR_CLIENT_SECRET", "MR_ORG_ID", "MR_OTHER_ORG_ID")
            method()
        except Skip as skip:
            status, detail = "SKIP", str(skip)
        except MiRotaractApiError as error:
            if scenario.get("requires") and error.status == 404:
                status, detail = "PENDING", f"requiere {scenario['requires']} (404)"
            else:
                status, detail = "FAIL", f"{type(error).__name__}: {error}"
        except Exception as error:  # noqa: BLE001
            status, detail = "FAIL", f"{type(error).__name__}: {error}"
        results.append({"id": scenario["id"], "status": status, "detail": detail})
        if not args.json:
            print(f"{status:<7} {scenario['id']}" + (f"  — {detail}" if detail else ""))

    summary = {s.lower(): sum(r["status"] == s for r in results) for s in ("PASS", "FAIL", "PENDING", "SKIP")}
    summary["runner"] = "python"
    if args.json:
        print(json.dumps({"summary": summary, "results": results}, indent=2, ensure_ascii=False))
    else:
        print(
            f"\npython: {summary['pass']} pass, {summary['fail']} fail, "
            f"{summary['pending']} pending, {summary['skip']} skip"
        )
    return 1 if summary["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
