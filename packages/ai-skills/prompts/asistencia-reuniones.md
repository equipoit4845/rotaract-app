---
title: Asistencia a las reuniones del club
description: La secretaría toma asistencia sobre el padrón oficial del club y ve el historial. FastAPI (Python).
template: fastapi
---

Para comités **sin desarrolladores**: copiás los comandos, pegás el prompt en tu
asistente y al final la app corre en tu computadora contra el kernel local.

## 1. Preparar (una vez)

Node 20+, Docker, Python 3.10+ y una copia de `rotaract-app`:

```bash
cd ~/rotaract-app && npx pnpm@10.13.1 install
npm install -g ./packages/cli
```

## 2. Crear la app y darle contexto a tu asistente

```bash
cd ~/proyectos
mirotaract init asistencia --template fastapi --kernel-repo ~/rotaract-app
cd asistencia
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npx @mirotaract/ai-skills install --target agents,cursor   # AGENTS.md + reglas de Cursor
mirotaract dev up --kernel-repo ~/rotaract-app --app-url http://localhost:8000
```

(Sin npm publicado: `node ~/rotaract-app/packages/ai-skills/bin/ai-skills.js install …`.)

Servidor MCP `@mirotaract/mcp` en Cursor (`.cursor/mcp.json` del proyecto):

```json
{
  "mcpServers": {
    "mirotaract": {
      "command": "node",
      "args": ["/home/vos/rotaract-app/packages/mcp-server/bin/mirotaract-mcp.js"],
      "env": { "MIROTARACT_BASE_URL": "http://localhost:54321/api/kernel/v1" }
    }
  }
}
```

## 3. Pegá este prompt

```text
Esta es una app FastAPI creada con `mirotaract init` (plantilla fastapi) con "Ingresar con
Mi Rotaract" y el padrón. Leé AGENTS.md y usá las skills y el MCP `mirotaract`.

Quiero tomar asistencia a las reuniones del club:
1. /reuniones: lista de reuniones del club de la persona (guardadas en SQLite con sqlite3 de
   la biblioteca estándar: id, organizationId, fecha, título).
2. Crear una reunión y tomar asistencia solo puede hacerlo quien tenga el permiso
   kernel.membership.update en ese club, chequeado en el servidor con
   POST /service/authorization/check (skill mirotaract-permisos). Fallá cerrado.
3. La planilla de asistencia sale del padrón oficial (socios ACTIVE y ON_LEAVE) con
   AsyncMiRotaract y el token de servicio; guardá solo membershipId y presente/ausente.
4. Cualquier socia o socio activo del club ve el historial de asistencia.
5. Scopes mínimos: login openid profile memberships; servicio memberships.read y
   authorization.check. Nada de datos de contacto.

Seguí el checklist de seguridad (sesión del servidor, secretos en variables de entorno,
html.escape en todo lo que venga de la API, nada de datos personales en los logs).
Agregá tests con pytest y decime cómo probarlo.
```

## 4. Probalo

```bash
.venv/bin/uvicorn app.main:app --reload --port 8000   # http://localhost:8000
```

Entrá con `secretaria.norte@example.org` / `sandbox-9999`, creá una reunión y
tomá asistencia; con `socio.norte@example.org` / `sandbox-9999` solo ves el
historial.
