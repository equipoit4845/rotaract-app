# 17 · Skills de IA, servidor MCP, llms.txt y evals (E10)

Épica E10 del plan _Mi Rotaract Developers_: "que los asistentes de código
integren bien". Guía de uso para desarrolladores:
[developers/ia.md](developers/ia.md). Este documento fija las decisiones de
diseño.

## Piezas

| Pieza | Ubicación | Historia |
|---|---|---|
| Skills por tarea (`@mirotaract/ai-skills`, bin `mirotaract-ai-skills`) | `packages/ai-skills` | E10.1 |
| Plantillas de prompt para comités sin desarrolladores | `packages/ai-skills/prompts/*.md` | E10.5 |
| Servidor MCP oficial (`@mirotaract/mcp`, bin `mirotaract-mcp`, stdio) | `packages/mcp-server` | E10.2 |
| `llms.txt` y `llms-full.txt` | `scripts/build-llms-txt.mjs` → `dist/llms/` | E10.3 |
| Evals, graders y gate de publicación | `evals/` (`@mirotaract/evals`) | E10.4 |
| Lectores compartidos de las fuentes de verdad | `scripts/lib/developer-sources.mjs` | — |
| Flag `mirotaract init --ai <destinos>` | `packages/cli/src/commands/init.js` | E10.1 |

Todo es JavaScript ESM sin build (como la CLI), Node ≥ 20. El kernel no se
tocó.

## Fuentes de verdad

Nada se escribe dos veces. `scripts/lib/developer-sources.mjs` lee:

- `docs/developers/*.md` (README primero, después en el orden de la tabla
  "Guías" del README);
- `kernel-openapi.yaml` (operaciones con `x-required-permission` /
  `x-required-scope`; para las rutas `/service/*` que no traen
  `x-required-scope` se usa la tabla "Resumen de scopes por endpoint" de
  `api-de-datos.md`);
- el catálogo de eventos (`catalog.ts`, `catalogDocument()`), importado con el
  type stripping de Node (≥ 22.18) o, si no está, transpilado con
  `typescript`;
- el catálogo de permisos (`prisma/seed.ts`: `permissionCodes` y
  `rolePermissions`, con los spreads resueltos; etiquetas de
  `prisma/catalog-labels.ts`) y los scopes (`oauth/scopes.ts`).

Lo usan `build-llms-txt.mjs` y el bundle del MCP. Ningún lector abre una red
ni una base.

## Skills (E10.1)

**Formato fuente único**: `packages/ai-skills/skills-src/<tarea>.md`,
Markdown en castellano con frontmatter YAML (`name`, `title`,
`description`, `globs`, `alwaysApply`) y código TS/Python. El checklist de
seguridad vive una sola vez en `skills-src/_checklist.md` y el generador lo
agrega al final de cada skill (una skill que lo repita no valida).

| Skill | Tarea |
|---|---|
| `mirotaract-ingresar` | "Ingresar con Mi Rotaract": Next.js, Express, FastAPI y Flutter |
| `mirotaract-padron` | Padrón, autoridades y períodos con token de servicio, paginación, ETag, `updatedSince` |
| `mirotaract-modulo` | Manifiesto `mirotaract.module.json` |
| `mirotaract-webhooks` | Firma, idempotencia por id, 2xx rápido |
| `mirotaract-permisos` | `POST /service/authorization/check` y `batch-check` |
| `mirotaract-kernel-local` | `mirotaract init` / `dev` / `gen types` / `webhooks listen` |

El checklist coincide con el de los `AGENTS.md` de las plantillas de la CLI
(un test lo verifica): tokens nunca en `localStorage`/`sessionStorage`,
verificación por JWKS con `iss`/`aud`/`alg`, scopes mínimos, firma de
webhooks verificada, secretos solo en variables de entorno del servidor, sin
datos personales en logs.

**Generadores** (`src/index.js`, puros y deterministas):

| Destino | Archivos | Formato |
|---|---|---|
| `claude` | `.claude/skills/<name>/SKILL.md` | Frontmatter `name` (≤ 64, minúsculas y guiones) y `description` (≤ 1024, sin `<>`), validados |
| `cursor` | `.cursor/rules/<name>.mdc` + `mirotaract-seguridad.mdc` (`alwaysApply: true`) | `description`, `globs` separados por coma (las llaves `{ts,py}` se expanden), `alwaysApply` |
| `copilot` | `.github/copilot-instructions.md` (bloque) + `.github/instructions/<name>.instructions.md` | `applyTo` separado por coma |
| `agents` | `AGENTS.md` (bloque) | Contexto + todas las skills (encabezados un nivel abajo) + checklist |

Cada archivo generado lleva la marca "Generado por @mirotaract/ai-skills".
**Instalador**: `npx @mirotaract/ai-skills install --target
claude|cursor|copilot|agents|all [carpeta]`. Nunca pisa un archivo que no
generó (sale con código 2 y pide `--force`); en `AGENTS.md` y
`copilot-instructions.md` reemplaza solo el bloque entre
`<!-- mirotaract-ai-skills:begin -->` y `…:end -->`, así conviven con el
`AGENTS.md` de la plantilla o reglas propias del equipo. `--dry-run`,
`--skills a,b`, `list`, `show`, `prompts` y `build` (todos los destinos en
`dist/<destino>/…`).

**`mirotaract init --ai claude,cursor`** instala las skills al crear la app
(dependencia de workspace `@mirotaract/ai-skills`; cambio aislado en
`init.js` y `args.js`).

`fingerprint()` = versión + hash del contenido de `skills-src`: ata los
resultados de los evals a una versión exacta de las skills.

## Servidor MCP (E10.2)

`@mirotaract/mcp`, transporte stdio, SDK oficial
`@modelcontextprotocol/sdk` (`McpServer.registerTool`, esquemas zod).
Configuración por entorno: `MIROTARACT_BASE_URL` (o `MIROTARACT_ISSUER`).

| Herramienta | Qué hace | Red |
|---|---|---|
| `search_docs` | BM25 sobre secciones (`##`/`###`) de `docs/developers`, sin acentos ni stop words; ruta + ancla + extracto | No |
| `read_doc` | Una guía completa o una sección | No |
| `describe_operation` | Por `operationId` o método + ruta (acepta ids concretos y el prefijo `/api/kernel/v1`): qué exige (scope de servicio, permiso de persona, credenciales OAuth o público), parámetros, cuerpo y respuesta con `$ref` resueltos (2 niveles), ejemplos TS/Python/curl (con el SDK cuando la operación tiene equivalente) | No |
| `list_permissions` | Permisos `kernel.*` con los roles del seed que los tienen, scopes de servicio con sus endpoints, scopes OIDC | No |
| `list_events` | Catálogo, firma y, por tipo, JSON Schema + ejemplo | No |
| `validate_module_manifest` | Ver abajo | No |
| `generate_types` | Mismos generadores que `mirotaract gen types` (`@mirotaract/cli/src/lib/codegen.js` y `generateTs`), sobre el contrato y el catálogo empaquetados | No |
| `create_test_app` | App de prueba en el distrito sintético | Solo kernel local |
| `issue_test_token` | Token de servicio de prueba (`client_credentials`) | Solo kernel local |

**Conocimiento empaquetado.** `npm run build` (en el paquete) escribe
`dist/bundle.json` (guías, OpenAPI en texto y parseado, catálogo, permisos,
operaciones). Desde un checkout sin build, `loadBundle()` lo arma en memoria
con los mismos lectores; por eso las guías pueden apuntar a
`node <repo>/packages/mcp-server/bin/mirotaract-mcp.js` sin pasos previos.

**Sandbox, nunca producción.** `create_test_app` e `issue_test_token`:

1. se niegan antes de cualquier pedido si la URL no es
   `http(s)://localhost|127.0.0.1|[::1]` sin credenciales en la URL
   (`isLocalKernel`; `0.0.0.0`, IPs privadas y `localhost.evil.com` no
   cuentan);
2. inician sesión con la cuenta admin del seed sintético
   (`admin@example.org` / `sandbox-9999`, configurable con
   `MIROTARACT_SANDBOX_ADMIN_*`); si no existe, no es un kernel de
   `mirotaract dev`;
3. exigen que **todas** las organizaciones `DISTRICT` tengan código `SBX-…`
   (el seed sintético se niega a correr sobre datos reales; esto es la
   segunda llave);
4. solo registran direcciones de regreso `http://localhost…`, y nunca siguen
   redirecciones.

En "modo producción" (cualquier otra URL, o ninguna) el servidor es solo
lectura de documentación y contratos. Ninguna herramienta devuelve datos
personales: las de documentación no tocan la red, y las de sandbox
devuelven metadatos de la app y el token de prueba (claims decodificados para
inspección, marcados como tales).

**Manifiesto de módulo.** El contrato es de E8
(`@mirotaract/module-manifest`, `validateManifest(json) → { ok, errors[] }`).
Ese paquete todavía no existe en esta rama, así que
`src/manifest.js` es un adaptador: intenta importarlo y, si no está, usa una
copia local del esquema mínimo del contrato (`id` como namespace, semver,
`contractVersion: 1`, permisos `<id>.…` con `scopeType`
`ORGANIZATION|ORGANIZATION_TREE`, eventos del catálogo y el scope que cada uno
exige, `configurationSchema` objeto, `ui.entryUrl` https, scopes conocidos y
advertencias por `contact.read` o secretos en la configuración).
**TODO(E8)**: agregar la dependencia y borrar `validateManifestLocal` cuando
se integre E8. Aun con el paquete oficial se conservan los chequeos cruzados
contra el catálogo de eventos.

## llms.txt (E10.3)

`node scripts/build-llms-txt.mjs [--out dist/llms] [--base-url …]` (o
`pnpm llms`):

- `llms.txt` según [llmstxt.org](https://llmstxt.org): H1, resumen en
  blockquote, reglas de seguridad, y secciones `## Empezar`, `## Guías`,
  `## Contratos`, `## Optional` con `- [título](url): descripción`. Las URLs
  de las guías son `<base>/docs/<slug>.md`, lo que sirve el portal (E9).
- `llms-full.txt`: todas las guías completas (cada una precedida por
  `<!-- source: docs/developers/x.md -->`), el JSON de `GET /events/catalog`
  con claves ordenadas y un resumen de la API por tag (operación, método y
  ruta, qué hace, qué requiere).

Determinista: sin fechas, orden estable, JSON con claves ordenadas (un test
compara dos builds). El portal (E9) lo corre en su build.

## Evals (E10.4)

```
evals/
  tasks/<id>/task.json          prompt, skills relevantes, graders y expectativas
  tasks/<id>/fixture/           proyecto inicial
  tasks/<id>/reference/<name>/  soluciones de referencia buenas y malas
  src/graders/*.js              un grader por regla
  src/runtime/                  ejecución aislada del webhook (proceso hijo)
  bin/evals.js                  list | fixture | prompt | run | references | generate | gate
```

Tareas: `login-nextjs` (Next.js, TS), `padron-club` (FastAPI, Python),
`webhooks-altas` (Next.js, TS, con ejecución real del handler),
`manifiesto-modulo` (JSON).

| Grader | Crítico | Cómo |
|---|---|---|
| `no-web-storage-tokens` | sí | AST de TS/JS (`setItem` y asignaciones a `localStorage`/`sessionStorage` con claves o valores de token); patrones en Python (HTML embebido), Dart (`SharedPreferences`) y HTML |
| `jwks-verification` | sí | SDK (`MiRotaractAuth`, `createMiRotaractNext`, `require_user`…, con `nonce` en `exchangeCode`) o `jwtVerify` / `jwt.decode` con JWKS, `issuer`, `audience`, `ES256` y comparación de `nonce`. `decodeJwt`, `verify_signature: False` o decodificar el payload a mano fallan |
| `minimal-scopes` | sí | Scopes pedidos (literales con `openid`, listas, `kernel.service.*`; el login del SDK sin `scope` cuenta como su default) ⊆ permitidos por la tarea, requeridos presentes, nada de `contact.read`; opcionalmente exige `scope` explícito en el token de servicio |
| `no-client-secrets` | sí | Secretos literales (`mrs_`, `whsec_`), `NEXT_PUBLIC_*SECRET…`, nombres de secretos en código de cliente (`"use client"`, `public/`, Dart, HTML), `.env.local` con secretos fuera de `.gitignore` |
| `webhook-signature` | sí | SDK (`verifyWebhook`, `createWebhookHandler`, `miRotaractWebhook`, `verify_webhook`) o HMAC-SHA256 sobre `"<timestamp>.<cuerpo crudo>"` + tolerancia + `timingSafeEqual`/`compare_digest`; falla con `request.json()` antes de verificar o JSON re-serializado |
| `webhook-runtime` | sí | Carga el `route.ts` bajo Node (type stripping, hooks que resuelven `@/…`, el SDK del monorepo y stubs de `server-only`/`next/server`) y manda entregas firmada (JSON con sangría, para detectar re-serialización), duplicada, adulterada, vieja y sin firma: 2xx en < 2 s / 2xx / 4xx / 4xx / 4xx. Si no carga fuera de Next.js, se saltea |
| `webhook-idempotency` | no | Usa `event.id` con una estructura de deduplicación |
| `no-pii-logs` | sí | Llamadas a `console.*`/`logger.*`/`print`/`logging.*` con personas, eventos completos, tokens o headers; ids, tipos y conteos están permitidos |
| `pagination` | no | Paginador del SDK o bucle con `nextCursor`/`hasMore` |
| `manifest-valid` | sí | Adaptador del MCP + expectativas de la tarea |
| `kernel-scopes` | no | Con `MIROTARACT_EVAL_KERNEL_URL` local: registra una app de sandbox con los scopes pedidos y emite un token (prueba que existen y se otorgan juntos). Sin kernel local se saltea; nunca toca uno remoto |

**Puntaje** de una tarea = peso de graders que pasan / peso de graders que
corrieron (los salteados no cuentan); una tarea "pasa" si ninguno falla. El
puntaje de una corrida es el promedio por tarea; una tarea sin solución vale 0.

**El test de los graders** (`evals/test/references.test.mjs`): las 6
referencias buenas sacan 100 % y las 4 malas fallan, cada una en los
graders que lista `mustFail`. Hay variantes buenas "a mano" (jose, HMAC) para
probar los caminos sin SDK.

**Cualquier asistente**: `evals fixture --task <id> --to <carpeta>`, se
resuelve con el asistente que sea y `evals run --task <id> --solution
<carpeta>` (o `--solutions <carpeta>` con una subcarpeta por tarea).

**Modo Claude (opcional)**: `evals generate` con `ANTHROPIC_API_KEY` llama a
`claude-sonnet-5-5` (SDK oficial `@anthropic-ai/sdk`, streaming,
`fallbacks: "default"` con la beta `server-side-fallback-2026-07-01`, esfuerzo
`medium`) por cada tarea, con y sin el `AGENTS.md` de las skills relevantes
en el system prompt; escribe las soluciones, las califica y reporta la
diferencia (`delta`). Un rechazo del modelo cuenta como tarea fallida. Los
tests usan un cliente falso: no hace falta clave.

**Gate de publicación**: `evals gate [--results evals/results/latest.json]
[--threshold 0.9]` (o `EVALS_THRESHOLD`). Aprueba solo si el puntaje **con
skills** ≥ umbral, no hay fallas críticas y la huella de las skills del
reporte coincide con la actual (`--allow-stale` para saltear esto último).
Es el `prepublishOnly` de `@mirotaract/ai-skills`.

## Pruebas

| Suite | Comando | Qué cubre |
|---|---|---|
| ai-skills | `node --test packages/ai-skills/test/*.test.mjs` | Validación de skills, cada renderer, checklist al final, expansión de globs, determinismo, bloques administrados, instalador, CLI, plantillas de prompt |
| mcp-server | `npm test` en `packages/mcp-server` | Cada herramienta con el cliente MCP en proceso (`InMemoryTransport`), sandbox contra un kernel falso (y negativas: host remoto, datos no sintéticos, admin inexistente, redirect no local), handshake real por stdio + `tools/list` + llamadas, ejemplos de configuración; `live-sandbox.test.mjs` contra un kernel local real si `MIROTARACT_MCP_LIVE_URL` está definido |
| llms | `node --test scripts/test/*.test.mjs` | Determinismo, convención llms.txt, cobertura de guías/eventos/API, lectores |
| evals | `node --test evals/test/*.test.mjs` | Referencias buenas/malas, cada grader, runner, gate, generate con cliente falso, CLI |
| cli | `node --test packages/cli/test/*.test.mjs` | Incluye `init --ai` |

La prueba en vivo se corrió una vez contra `mirotaract dev up --no-build
--no-web` (puertos 54321/54322, `MIROTARACT_HOME` aislado) y se bajó con
`dev down --volumes`: `create_test_app` + `issue_test_token` por stdio, el
token lee el padrón del club sandbox, y `kernel-scopes` pasa en las
referencias.

## Pendiente

- **Publicación**: `@mirotaract/ai-skills`, `@mirotaract/mcp` y la CLI son
  `private` y no están en npm; `npx @mirotaract/ai-skills` y
  `npx @mirotaract/mcp` funcionarán cuando se publiquen. Mientras tanto se usan
  desde el repo (`node <repo>/packages/…/bin/…`). `@mirotaract/mcp` depende de
  `@mirotaract/cli` para reusar el codegen: hay que publicarlos juntos.
- **E8**: cambiar el adaptador del manifiesto al paquete
  `@mirotaract/module-manifest`.
- **Resultados del gate**: todavía no hay una corrida de `evals generate` con
  clave; hasta que la haya, `evals gate` (y por ende `prepublishOnly`) falla
  a propósito.
- El runtime de webhooks cubre route handlers de Next.js; Express y FastAPI
  se califican solo de forma estática.
