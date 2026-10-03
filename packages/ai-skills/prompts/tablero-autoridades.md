---
title: Tablero de autoridades del distrito
description: Una página con las autoridades vigentes de cada club (presidencia, secretaría, tesorería), sin datos de contacto. Next.js.
template: next
---

Para comités **sin desarrolladores**: al final la página muestra las
autoridades del distrito sintético en tu computadora.

## 1. Crear la app

```bash
cd ~/proyectos
mirotaract init autoridades --template next --kernel-repo ~/rotaract-app
cd autoridades && npm install
npx @mirotaract/ai-skills install --target claude
mirotaract dev up --kernel-repo ~/rotaract-app
# servidor MCP @mirotaract/mcp (Cursor y VS Code: docs/developers/ia.md)
claude mcp add mirotaract --env MIROTARACT_BASE_URL=http://localhost:54321/api/kernel/v1 -- node ~/rotaract-app/packages/mcp-server/bin/mirotaract-mcp.js
```

## 2. Pegá este prompt

```text
App Next.js creada con `mirotaract init`. Leé AGENTS.md y usá las skills de Mi Rotaract
(mirotaract-padron) y el MCP `mirotaract` (describe_operation serviceListAuthorities).

Quiero /autoridades: una tabla por club con sus autoridades vigentes.
1. En un Server Component, con el token de servicio (scope kernel.service.authorities.read y
   kernel.service.organizations.read, nada más), traé las organizaciones tipo CLUB del
   distrito (MIROTARACT_ORGANIZATION_ID) y authorities.list(distrito, { includeDescendants: true }).
2. Agrupá por club; ordená por cargo usando positionCode (CLUB_PRESIDENT primero) y mostrá
   positionName y person.displayName. Nada de datos de contacto.
3. La página es solo para quien ingresó con Mi Rotaract (cualquier socio/a activo/a).
4. Cacheá la respuesta 5 minutos en el servidor y usá ETag si refrescás.

Seguí el checklist de seguridad. Corré `npm run typecheck` y `npm run build`.
```

## 3. Probalo

`npm run dev`, entrá con `socio.norte@example.org` / `sandbox-9999` y abrí
`http://localhost:3000/autoridades`: ves la presidencia y la secretaría de los
seis clubes sandbox.
