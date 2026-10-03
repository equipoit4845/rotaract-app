---
name: mirotaract-kernel-local
title: Usar el kernel local (mirotaract dev)
description: >-
  Levanta y usa el kernel local de Mi Rotaract con datos sintéticos (mirotaract
  init, dev up/status/down/reset, gen types, webhooks listen) para desarrollar
  y probar sin datos reales. Usala cuando haya que crear una app nueva desde
  plantilla, correr la app en local, conseguir credenciales de prueba, cuentas
  de prueba, generar tipos o probar webhooks en la computadora.
globs:
  - "**/.env.example"
  - "**/package.json"
  - "**/requirements.txt"
  - "**/pubspec.yaml"
---

## Cuándo

Siempre que desarrolles o pruebes: **nunca** uses credenciales de producción
en tu computadora ni copies datos reales del padrón. El kernel local trae el
_Distrito 9999 (sandbox)_: 6 clubes, 60 personas ficticias (`@example.org`),
período vigente, autoridades y cuentas de prueba.

Requisitos: Node 20+, Docker con `docker compose` v2, una copia del repo del
kernel (`rotaract-app`; mientras la CLI y los SDKs no estén publicados, todo se
instala desde ahí) y los puertos `54321` (API) y `54322` (web) libres.

## Comandos

```bash
# App nueva (plantillas: next, fastapi, flutter). Trae login, padrón, webhooks y AGENTS.md
mirotaract init mi-app --template next --kernel-repo ~/rotaract-app
cd mi-app && npm install

# Kernel local + app de prueba registrada + credenciales en .env.local (idempotente)
mirotaract dev up --kernel-repo ~/rotaract-app            # FastAPI: --app-url http://localhost:8000
mirotaract dev status                                      # URLs, cuentas de prueba; --json para scripts
mirotaract dev down                                        # detiene (conserva datos); --volumes borra la base
mirotaract dev reset                                       # base nueva desde cero

# Tipos de la API y de los eventos
mirotaract gen types                                       # TS → src/mirotaract-types.ts
mirotaract gen types --lang python                         # TypedDicts → app/mirotaract_types.py

# Webhooks a tu servidor local (imprime un whsec_ para MIROTARACT_WEBHOOK_SECRET)
mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks
```

Sin instalar la CLI global: `node ~/rotaract-app/packages/cli/bin/mirotaract.js …`.

## Lo que deja `dev up`

| Variable en `.env.local` | Valor |
|---|---|
| `MIROTARACT_ISSUER`, `MIROTARACT_BASE_URL` | `http://localhost:54321/api/kernel/v1` |
| `MIROTARACT_WEB_URL` | `http://localhost:54322` (login y consentimiento) |
| `MIROTARACT_CLIENT_ID`, `MIROTARACT_CLIENT_SECRET` | App local `CONFIDENTIAL`; **cada `dev up` rota el secreto** |
| `MIROTARACT_APP_ID` | Id interno de la app (lo usa `webhooks listen`) |
| `MIROTARACT_PUBLIC_CLIENT_ID` | App `PUBLIC` de prueba (móvil/SPA) |
| `MIROTARACT_ORGANIZATION_ID` | El distrito sintético |
| `APP_URL`, `SESSION_SECRET` | Solo si no estaban |

`.env.local` queda con permisos `600` y **tiene que estar en `.gitignore`**.

Cuentas de prueba (contraseña `sandbox-9999`): `admin@example.org`
(superadmin), `rdr@example.org`, `secretaria.distrito@example.org`,
`presidencia.norte@example.org`, `secretaria.norte@example.org`,
`socio.norte@example.org`, `socio.sur@example.org` (otro club).

## Con el servidor MCP

Con `MIROTARACT_BASE_URL=http://localhost:54321/api/kernel/v1`, el MCP
`@mirotaract/mcp` habilita dos herramientas de sandbox:

- `create_test_app`: registra una app de prueba en el distrito sintético con
  los scopes y direcciones de regreso (`localhost`) que pidas.
- `issue_test_token`: emite un token de servicio de prueba para esa app.

Contra cualquier host que no sea local, esas herramientas se niegan: en
producción el MCP es solo lectura de documentación y contratos.

## Si algo falla

| Síntoma | Qué hacer |
|---|---|
| `El puerto 54321 ya está en uso` | `--api-port 55321 --web-port 55322` |
| `Falta el repositorio del kernel` | `--kernel-repo` o `MIROTARACT_KERNEL_REPO` |
| `invalid_client` en tu app | Corriste `dev up` en otra carpeta y el secreto rotó: correlo en la carpeta de tu app |
| Login vuelve con `redirect_uri` inválida | `mirotaract dev up --app-url http://localhost:<puerto>` |
| Logs | `docker compose -p mirotaract-dev logs -f api` |

No cambies los puertos a 3000/3001/5432/6379 (la CLI los rechaza).
