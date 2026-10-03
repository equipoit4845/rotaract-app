---
title: Una app para inscripciones a un evento del distrito
description: Las personas entran con su cuenta de Mi Rotaract, se inscriben a un evento y el comité organizador ve la lista. Next.js.
template: next
---

Para comités **sin desarrolladores**: copiás los comandos, pegás el prompt en tu
asistente de código (Claude Code, Cursor, Copilot) y al final tenés la app
andando en tu computadora contra el kernel local, con datos ficticios.

## 1. Preparar (una vez, 15 minutos)

Necesitás Node 20+, Docker y una copia del repositorio `rotaract-app` (pedísela
al equipo de Mi Rotaract). En una terminal:

```bash
cd ~/rotaract-app && npx pnpm@10.13.1 install && npx pnpm@10.13.1 --filter @mirotaract/sdk build
npm install -g ./packages/cli            # deja el comando `mirotaract`
```

## 2. Crear la app y darle contexto a tu asistente

```bash
cd ~/proyectos
mirotaract init inscripciones --template next --kernel-repo ~/rotaract-app
cd inscripciones && npm install
npx @mirotaract/ai-skills install --target claude   # o cursor, copilot, agents
mirotaract dev up --kernel-repo ~/rotaract-app      # kernel local + .env.local
```

(Mientras los paquetes no estén publicados en npm, en lugar de
`npx @mirotaract/ai-skills` usá `node ~/rotaract-app/packages/ai-skills/bin/ai-skills.js`.)

Conectá el servidor MCP `@mirotaract/mcp` (documentación, permisos y eventos
al alcance del asistente). En Claude Code:

```bash
claude mcp add mirotaract --env MIROTARACT_BASE_URL=http://localhost:54321/api/kernel/v1 -- node ~/rotaract-app/packages/mcp-server/bin/mirotaract-mcp.js
```

Para Cursor y VS Code, ver `docs/developers/ia.md`.

## 3. Pegá este prompt

```text
Estás trabajando en una app Next.js creada con `mirotaract init` (plantilla next) que ya tiene
"Ingresar con Mi Rotaract". Leé AGENTS.md y usá las skills de Mi Rotaract y el MCP `mirotaract`.

Quiero una app de inscripciones a un evento del distrito ("Conferencia Distrital"):
1. En la portada, quien no ingresó ve el botón "Ingresar con Mi Rotaract".
2. Quien ingresó ve el evento y un formulario corto: si viene, si necesita alojamiento y
   restricciones alimentarias. Al enviar, se guarda su inscripción identificada por su `sub`
   (personId), nunca por email. Guardá las inscripciones en un archivo JSON del servidor
   (data/inscripciones.json) con solo: personId, nombre visible, club, respuestas y fecha.
3. Solo socias y socios ACTIVE u ON_LEAVE de un club pueden inscribirse (consultá sus
   membresías al kernel en el momento, como hace src/lib/clubs.ts).
4. Una página /organizacion lista las inscripciones. Solo la ve quien tenga el permiso
   kernel.membership.read sobre el distrito (MIROTARACT_ORGANIZATION_ID), consultado con
   POST /service/authorization/check (skill mirotaract-permisos), en el servidor.
5. Pedí los scopes mínimos (login: openid profile memberships). No pidas datos de contacto.

Seguí el checklist de seguridad de las skills (nada de tokens en localStorage, secretos solo en
el servidor, nada de datos personales en los logs). Al terminar corré `npm run typecheck` y
`npm run build`, y decime cómo probarlo.
```

## 4. Probalo

```bash
npm run dev     # http://localhost:3000
```

- Entrá con `socio.norte@example.org` / `sandbox-9999` e inscribite.
- Entrá con `rdr@example.org` / `sandbox-9999` y abrí `/organizacion`: ves la
  lista. Con `socio.sur@example.org` no deberías poder verla.
- `mirotaract dev status` muestra todas las cuentas de prueba.

## 5. Antes de producción

Pedile al RDR que registre la app (nombre, club o distrito, scopes y dirección
de regreso), repasá `docs/developers/seguridad.md` y reemplazá el archivo
JSON por una base de datos real.
