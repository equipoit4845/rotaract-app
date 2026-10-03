# Programar con asistentes de IA

> **¿Querés que el asistente construya la app entera?** Empezá por
> [Crear una app con IA](crear-con-ia.md) (o
> [developers.rotaract4845.com/ia](https://developers.rotaract4845.com/ia)):
> un prompt que instala todo lo de esta página y arma la app paso a paso.

Si usás Claude Code, Cursor, GitHub Copilot u otro asistente, dale el
contexto de Mi Rotaract para que integre bien a la primera: login con PKCE y
verificación por JWKS, token de servicio con scopes mínimos, webhooks
firmados. Hay tres piezas, y se combinan:

| Pieza | Qué le da al asistente | Cómo |
|---|---|---|
| **Skills** (`@mirotaract/ai-skills`) | Instrucciones por tarea, en castellano, con código TS/Python y el checklist de seguridad | `npx @mirotaract/ai-skills install --target …` |
| **Servidor MCP** (`@mirotaract/mcp`) | Herramientas para buscar en esta documentación, describir operaciones de la API, listar permisos y eventos, validar manifiestos y generar tipos; en local, crear apps y tokens de prueba | Configurarlo en el asistente |
| **`llms.txt`** | Toda la documentación en un archivo | `https://developers.rotaract4845.com/llms.txt` y `/llms-full.txt` |

> **Instalación.** El servidor MCP está en npm (`npx -y @mirotaract/mcp`). Las
> skills (`@mirotaract/ai-skills`) todavía no: se publican cuando superen las
> evaluaciones de calidad. Mientras tanto, la CLI las instala desde el portal
> sin el paquete: `npx @mirotaract/cli@latest ai install --target claude`
> (baja [`/ia/skills.json`](https://developers.rotaract4845.com/ia/skills.json)
> y verifica su SHA-256). Son una **versión preliminar**: todavía no pasaron
> las evaluaciones automáticas.

## 1. Instalar las skills

En la carpeta de tu app, con la CLI (no necesita el paquete de skills):

```bash
npx @mirotaract/cli@latest ai install --target claude   # o cursor, copilot, agents, all
```

O con el paquete, cuando esté publicado (o desde una copia del repo):

```bash
npx @mirotaract/ai-skills install --target claude     # Claude Code
npx @mirotaract/ai-skills install --target cursor     # Cursor
npx @mirotaract/ai-skills install --target copilot    # GitHub Copilot
npx @mirotaract/ai-skills install --target agents     # AGENTS.md (Codex, Gemini, Zed, Jules, …)
npx @mirotaract/ai-skills install --target all        # todo lo anterior
```

O al crear la app: `mirotaract init mi-app --template next --ai claude,agents`.

| Destino | Qué escribe |
|---|---|
| `claude` | `.claude/skills/<skill>/SKILL.md`: Claude Code las carga solo cuando la tarea lo pide |
| `cursor` | `.cursor/rules/<skill>.mdc` (se activan por tipo de archivo o cuando el agente las pide) y `mirotaract-seguridad.mdc`, siempre activa |
| `copilot` | `.github/copilot-instructions.md` y `.github/instructions/<skill>.instructions.md` (con `applyTo`) |
| `agents` | `AGENTS.md` con todas las skills |

Las skills: `mirotaract-ingresar` (login en Next.js, Express, FastAPI y
Flutter), `mirotaract-padron` (padrón, autoridades, períodos, paginación,
ETag), `mirotaract-permisos` (chequeo de permisos), `mirotaract-webhooks`,
`mirotaract-modulo` (manifiesto de módulo) y `mirotaract-kernel-local`
(`mirotaract dev`). Todas terminan con el mismo checklist de seguridad que el
`AGENTS.md` de las plantillas y [seguridad.md](seguridad.md).

- Repetir `install` es seguro: actualiza lo que generó y deja todo lo demás.
- Si ya tenés un `AGENTS.md` o `copilot-instructions.md`, las skills van en
  un bloque propio (`<!-- mirotaract-ai-skills:begin -->`…`end`) y tu texto
  queda intacto.
- Un archivo con el mismo nombre que no generó el instalador **no se pisa**
  (sale con código 2); `--force` lo reemplaza.
- `--dry-run` muestra qué haría; `--skills mirotaract-webhooks,mirotaract-padron`
  instala solo esas; `list` y `show <skill>` las muestran.

Versionalas con tu proyecto (son texto) y volvé a correr `install` cuando
salga una versión nueva.

## 2. Configurar el servidor MCP

El servidor corre en tu computadora por stdio. La variable
`MIROTARACT_BASE_URL` decide el modo:

- **Kernel local** (`http://localhost:54321/api/kernel/v1`, el de
  `mirotaract dev up`): todas las herramientas, incluidas `create_test_app` e
  `issue_test_token`, que trabajan sobre el distrito sintético.
- **Cualquier otra URL, o ninguna**: solo lectura de documentación y
  contratos. Las herramientas de sandbox se niegan, aunque apuntes a
  producción. El servidor nunca devuelve datos personales.

### Claude Code

```bash
claude mcp add mirotaract \
  --env MIROTARACT_BASE_URL=http://localhost:54321/api/kernel/v1 \
  -- node ~/rotaract-app/packages/mcp-server/bin/mirotaract-mcp.js
```

O compartido con el equipo, en `.mcp.json` en la raíz del proyecto (ejemplo
en `packages/mcp-server/examples/.mcp.json`; usa `MIROTARACT_KERNEL_REPO`,
la misma variable que la CLI):

```json
{
  "mcpServers": {
    "mirotaract": {
      "type": "stdio",
      "command": "node",
      "args": ["${MIROTARACT_KERNEL_REPO}/packages/mcp-server/bin/mirotaract-mcp.js"],
      "env": { "MIROTARACT_BASE_URL": "${MIROTARACT_BASE_URL:-http://localhost:54321/api/kernel/v1}" }
    }
  }
}
```

Verificalo con `/mcp` dentro de Claude Code.

### Cursor

`.cursor/mcp.json` en el proyecto (o `~/.cursor/mcp.json` para todos):

```json
{
  "mcpServers": {
    "mirotaract": {
      "command": "node",
      "args": ["/ruta/a/rotaract-app/packages/mcp-server/bin/mirotaract-mcp.js"],
      "env": { "MIROTARACT_BASE_URL": "http://localhost:54321/api/kernel/v1" }
    }
  }
}
```

Después, en **Settings → MCP**, activá `mirotaract`.

### VS Code (GitHub Copilot, modo agente)

`.vscode/mcp.json`:

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

En los tres casos también alcanza con el paquete publicado en npm:
`"command": "npx", "args": ["-y", "@mirotaract/mcp"]`.

### Herramientas

| Herramienta | Para qué |
|---|---|
| `search_docs` | Buscar en estas guías (devuelve sección, ruta y extracto) |
| `read_doc` | Leer una guía o una sección completa |
| `describe_operation` | Una operación del contrato (`serviceListMembers`, o `GET /service/organizations/{organizationId}/members`): parámetros, esquemas, scope o permiso, ejemplos en TS, Python y curl |
| `list_permissions` | Permisos del kernel (y qué roles los tienen), scopes de servicio y scopes OIDC |
| `list_events` | Tipos de evento de webhooks, con su esquema y un ejemplo |
| `validate_module_manifest` | Validar `mirotaract.module.json` |
| `generate_types` | Tipos TypeScript o Python de la API y los eventos |
| `create_test_app` | (solo kernel local) Registrar una app de prueba con los scopes que necesitás |
| `issue_test_token` | (solo kernel local) Emitir un token de servicio de prueba |

Pedile cosas como: "describí la operación para leer el padrón y armame el
código en Python", "¿qué permiso necesito para dar de alta socios?",
"validá el manifiesto", "creá una app de prueba con
`kernel.service.memberships.read` y dame un token".

## 3. `llms.txt`

- `https://developers.rotaract4845.com/llms.txt`: índice de las guías con una
  línea de descripción cada una ([llmstxt.org](https://llmstxt.org)).
- `https://developers.rotaract4845.com/llms-full.txt`: todas las guías, el
  catálogo de eventos y un resumen de la API en un solo archivo, para pegar
  en un chat o adjuntar.

Se regeneran con cada release (`pnpm llms` en el repo escribe
`dist/llms/`). Cada página del portal tiene además "Copiar como Markdown" y
"Abrir en Claude/ChatGPT".

## 4. Si tu comité no tiene desarrolladores

Hay plantillas de prompt listas: combinan `mirotaract init`, las skills y el
MCP, y terminan con la app andando contra el kernel local con datos ficticios.

```bash
npx @mirotaract/ai-skills prompts                         # lista
npx @mirotaract/ai-skills prompts inscripciones-evento    # una, completa
```

| Plantilla | App |
|---|---|
| `inscripciones-evento` | Inscripciones a un evento del distrito (Next.js) |
| `asistencia-reuniones` | Asistencia a las reuniones del club (FastAPI) |
| `bienvenida-nuevos-socios` | Lista de bienvenida a partir de webhooks de altas (Next.js) |
| `tablero-autoridades` | Autoridades vigentes de cada club (Next.js) |

Antes de producción, igual: pedile al RDR que registre la app y repasá
[seguridad.md](seguridad.md).

## 5. Evals: ¿el asistente integró bien?

`evals/` en el repo tiene tareas reales ("agregá login a una app Next.js",
"mostrá el padrón del club", "recibí webhooks de altas de socios", "creá el
manifiesto de un módulo") con chequeos automáticos de lo que no se negocia:
tokens fuera de `localStorage`, verificación por JWKS (`iss`, `aud`, `alg`),
scopes mínimos, firma de webhooks (SDK o HMAC con tolerancia), secretos fuera
del código de cliente y nada de datos personales en logs.

Con **cualquier asistente**:

```bash
cd ~/rotaract-app
node evals/bin/evals.js list
node evals/bin/evals.js fixture --task login-nextjs --to /tmp/intento   # proyecto inicial + prompt
# … resolvé la tarea en /tmp/intento con tu asistente …
node evals/bin/evals.js run --task login-nextjs --solution /tmp/intento
```

`run --solutions <carpeta>` califica todas las tareas (una subcarpeta por
tarea); `--json` y `--out` guardan el reporte. Con el kernel local levantado,
`MIROTARACT_EVAL_KERNEL_URL=http://localhost:54321/api/kernel/v1` agrega un
chequeo en vivo: los scopes que pidió la solución se registran y se emite un
token con ellos.

Con **Claude** (opcional, `ANTHROPIC_API_KEY`):

```bash
ANTHROPIC_API_KEY=… node evals/bin/evals.js generate   # claude-sonnet-5-5, con y sin skills
```

Resuelve cada tarea dos veces (con y sin las skills), califica y muestra la
diferencia. El reporte queda en `evals/results/latest.json`.

**Gate de publicación**: una versión de las skills se publica solo si
`node evals/bin/evals.js gate` aprueba: puntaje con skills ≥ 90 %
(`--threshold` o `EVALS_THRESHOLD`), sin fallas críticas de seguridad y con
resultados de esa misma versión de las skills.

Diseño completo: [17-ai-skills.md](../17-ai-skills.md).
