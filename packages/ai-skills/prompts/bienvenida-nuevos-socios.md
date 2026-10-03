---
title: Bienvenida a nuevos socios (webhooks)
description: Cada vez que un club da de alta a un socio, la app lo agrega a una lista de bienvenida para el comité de integración. Next.js + webhooks.
template: next
---

Para comités **sin desarrolladores**. Al final, la app recibe eventos reales
del kernel local (datos ficticios) en tu computadora.

## 1. Crear la app

```bash
cd ~/proyectos
mirotaract init bienvenida --template next --kernel-repo ~/rotaract-app
cd bienvenida && npm install
npx @mirotaract/ai-skills install --target copilot   # o claude, cursor, agents
mirotaract dev up --kernel-repo ~/rotaract-app
```

Servidor MCP `@mirotaract/mcp` en VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "mirotaract": {
      "type": "stdio",
      "command": "node",
      "args": ["${userHome}/rotaract-app/packages/mcp-server/bin/mirotaract-mcp.js"],
      "env": { "MIROTARACT_BASE_URL": "http://localhost:54321/api/kernel/v1" }
    }
  }
}
```

## 2. Pegá este prompt

```text
App Next.js creada con `mirotaract init` (plantilla next). Leé AGENTS.md y usá las skills
de Mi Rotaract (sobre todo mirotaract-webhooks) y el MCP `mirotaract` (list_events).

Quiero una lista de bienvenida para el comité de integración:
1. POST /api/webhooks/mirotaract recibe los webhooks de Mi Rotaract. Verificá la firma con
   createWebhookHandler de @mirotaract/sdk/next sobre el cuerpo crudo y
   MIROTARACT_WEBHOOK_SECRET. Deduplicá por event.id y respondé 2xx rápido.
2. Con membership.activated.v1 agregá a data/bienvenida.json: personId, displayName,
   organizationId, fecha y estado "pendiente". Con membership.ended.v1 marcá "dado de baja".
   No guardes ni loguees emails ni teléfonos (logueá solo event.id y event.type).
3. /bienvenida muestra la lista (solo para quien ingresó con Mi Rotaract y tiene el permiso
   kernel.membership.read sobre el distrito, chequeado en el servidor) y permite marcar
   "contactado".
4. Scopes mínimos: servicio memberships.read y authorization.check; login openid profile.

Seguí el checklist de seguridad. Al terminar corré `npm run typecheck` y `npm run build`.
```

## 3. Probalo

```bash
npm run dev
mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks/mirotaract
# copiá el whsec_ que imprime a MIROTARACT_WEBHOOK_SECRET en .env.local y reiniciá npm run dev
```

Entrá a `http://localhost:54322` con `secretaria.norte@example.org` /
`sandbox-9999`, activá una membresía pendiente y mirá cómo aparece en
`/bienvenida` (entrando con `rdr@example.org` / `sandbox-9999`).
