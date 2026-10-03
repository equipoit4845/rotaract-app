# Crear una app con IA

Contale tu idea a un asistente de código y él la construye: una app
conectada a Mi Rotaract, con los datos oficiales, la arquitectura recomendada
y las herramientas del distrito. No hace falta ser desarrollador. La versión
interactiva de esta guía, con el formulario que arma el prompt, está en
[developers.rotaract4845.com/ia](https://developers.rotaract4845.com/ia).

> **Asistente de código**: un programa de IA que, además de conversar, puede
> correr comandos y escribir archivos en tu computadora (Claude Code, Cursor,
> GitHub Copilot en modo agente, Codex). **Prompt**: el texto con las
> instrucciones que le pegás.

## En tres pasos

1. **Elegí o describí tu idea**: qué querés construir, quién la va a usar,
   qué datos necesita y si es para un club o para todo el distrito.
2. **Copiá el prompt** de [/ia](https://developers.rotaract4845.com/ia)
   (elegí tu asistente; si no podés copiar, descargalo como archivo). La
   versión genérica, para cualquier asistente, está en
   [`/ia/prompt.md`](https://developers.rotaract4845.com/ia/prompt.md).
3. **Pegalo en tu asistente**, en una conversación nueva abierta en una
   carpeta vacía (por ejemplo `mi-app-rotaract`).

## ¿Qué podés construir?

Ideas de ejemplo (cada una tiene un botón "Usar esta idea" en la página):

| Idea | Alcance | Plantilla |
|---|---|---|
| Inscripciones a un evento del distrito | Distrito | Next.js |
| Asistencia a las reuniones del club | Club | FastAPI (Python) |
| Bienvenida a nuevos socios (avisos de altas por webhooks) | Distrito | Next.js |
| Tablero de autoridades vigentes | Distrito | Next.js |
| Horas de servicio por proyecto | Club | Next.js |
| Seguimiento de cuotas (sin cobrar en línea) | Club | Next.js |
| Calendario distrital de proyectos y eventos | Distrito | Next.js |
| Votaciones de asamblea con voto secreto | Club | Next.js |
| Informe mensual de clubes al distrito | Distrito | FastAPI (Python) |

Las cuatro primeras tienen además una plantilla de prompt detallada
(`npx @mirotaract/ai-skills prompts`, ver [ia.md](ia.md#4-si-tu-comité-no-tiene-desarrolladores)).

## Lo que necesitás

- **Una computadora** (Mac, Windows con WSL2 o Linux) con **Node 20 o más**
  (el motor que corre las herramientas), **Docker** (para un Mi Rotaract de
  prueba en tu computadora) y **git** (para bajar el código del distrito).
  Unos 6 GB libres. Si te falta algo, el asistente te explica cómo
  instalarlo.
- **Un asistente de código que pueda correr comandos**: **Claude Code**
  (recomendado), **Cursor** (en modo Agent), **VS Code con GitHub Copilot**
  (modo agente) o **Codex, Gemini CLI y otros** que lean `AGENTS.md`.

Los asistentes de chat del navegador (claude.ai, ChatGPT) sirven para
**pensar la idea**, pero no pueden construirla: no instalan nada ni corren la
app. En la página hay un botón "Abrir en Claude para planificar" con un
prompt de planificación.

## Qué va a pasar

El prompt le pide al asistente que trabaje así, preguntándote solo lo que es
decisión tuya (aprobar el plan, gastos, instalar programas con contraseña de
administrador, quién es responsable de la app, dónde publicarla):

1. Revisa que tengas Node, Docker y git, y te explica cómo instalar lo que
   falte, según tu sistema.
2. Lee la documentación ([llms.txt](https://developers.rotaract4845.com/llms.txt),
   `llms-full.txt`) antes de escribir código.
3. Escribe un plan corto (`PLAN.md`: problema, roles, pantallas, datos de Mi
   Rotaract y datos propios, permisos, eventos) y **espera tu OK**.
4. Crea la app con la CLI oficial (`mirotaract init . --template next|fastapi --ai <asistente>`),
   que instala las **skills** de Mi Rotaract, y configura el **servidor MCP**
   (`npx -y @mirotaract/mcp`).
5. Baja el repositorio público y levanta un **kernel local** con un distrito
   inventado (`mirotaract dev up`, Distrito 9999). La primera vez tarda **10 a
   15 minutos**. Nunca se usan datos personales reales.
6. Construye la app con la arquitectura recomendada (abajo), en castellano,
   con el aspecto de Mi Rotaract, tests y README.
7. Repasa el checklist de seguridad y corre los evaluadores automáticos
   (`evals/`).
8. Te la muestra funcionando y te dice con qué cuentas de prueba entrar
   (`socio.norte@example.org`, `rdr@example.org`… contraseña `sandbox-9999`).
9. Deja todo listo para producción: `.env.example`, `DEPLOY.md`,
   `PRIVACIDAD.md` y `REVISION-RDR.md` (el texto para la revisión del RDR).

### La arquitectura que sigue

- Sesión del lado del servidor con el SDK oficial; nunca tokens en el
  navegador.
- API de datos solo desde el servidor, con las credenciales de la app y los
  **scopes mínimos**.
- Webhooks para enterarse de cambios, verificando la firma.
- Base de datos propia solo para lo propio de la app, con los ids del kernel
  como claves y sin copiar datos personales.
- Manifiesto de módulo ([modulos.md](modulos.md)) si la app se instala por
  club.
- Componentes del [kit de UI](kit-de-ui.md)
  (`npx shadcn add https://developers.rotaract4845.com/r/<componente>.json`).

## Cuando esté lista

1. **Registrá la app**: mandale al RDR `REVISION-RDR.md` (propósito, datos que
   pide y por qué, responsable, política de privacidad y contacto). Ver
   [registrar-una-app.md](registrar-una-app.md).
2. **Revisión del RDR**: cuando el RDR aprueba tu app, pasa de prueba a
   producción con los permisos aprobados. Ver
   [revision-de-apps.md](revision-de-apps.md) y los límites de uso en
   [limites.md](limites.md).
3. **Publicala** en un servicio simple:

   | Plantilla | Servicio recomendado | Cómo |
   |---|---|---|
   | Next.js | [Vercel](https://vercel.com) | Importás el repositorio de GitHub (plan gratuito). |
   | FastAPI | [Render](https://render.com) (o Railway, Fly.io) | Web Service: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. |

   Base de datos, si la usa: Postgres administrado (Neon, Supabase o el del
   servicio). Variables de entorno:

   | Variable | Valor |
   |---|---|
   | `MIROTARACT_ISSUER`, `MIROTARACT_BASE_URL` | `https://api.rotaract4845.com/api/kernel/v1` |
   | `MIROTARACT_CLIENT_ID`, `MIROTARACT_CLIENT_SECRET` | Los que te da el RDR (el secreto, solo en el servidor) |
   | `MIROTARACT_ORGANIZATION_ID` | El club o el distrito de la app |
   | `APP_URL` | La dirección pública (la de regreso es `<APP_URL>/auth/callback`) |
   | `SESSION_SECRET` | 32+ caracteres aleatorios |
   | `MIROTARACT_WEBHOOK_SECRET` | Si recibe webhooks |
   | `DATABASE_URL` | Si guarda datos propios |

4. **En el panel de los socios**: una vez aprobada, la app aparece en el panel
   de los socios de Mi Rotaract.

## Las herramientas que instala

| Herramienta | Qué es | Cómo |
|---|---|---|
| CLI `@mirotaract/cli` | Plantillas, kernel local, tipos, webhooks e instalación de skills | `npx @mirotaract/cli@latest …` |
| Servidor MCP `@mirotaract/mcp` | Documentación, contrato de la API, permisos y eventos para el asistente | `npx -y @mirotaract/mcp` ([ia.md](ia.md#2-configurar-el-servidor-mcp)) |
| Skills | Guías por tarea para el asistente, con el checklist de seguridad | `mirotaract ai install --target claude\|cursor\|copilot\|agents` |

Las skills se bajan del portal como un paquete versionado,
[`/ia/skills.json`](https://developers.rotaract4845.com/ia/skills.json), con
su suma SHA-256 en `/ia/skills.json.sha256`: la CLI la verifica antes de
escribir nada. También están sueltas para bajarlas a mano:
[`/ia/AGENTS.md`](https://developers.rotaract4845.com/ia/AGENTS.md),
`/ia/claude/skills/<skill>/SKILL.md`, `/ia/cursor/rules/<skill>.mdc` y
`/ia/copilot/…`.

> **Versión preliminar.** Las skills todavía no pasaron las evaluaciones
> automáticas (el gate de [ia.md](ia.md#5-evals-el-asistente-integró-bien)).
> Son útiles, pero si contradicen la documentación, manda la documentación.

## Preguntas frecuentes

**¿Cuánto cuesta?** La plataforma, la CLI, el SDK y el servidor MCP son
gratis (MIT). El asistente puede tener costo (Claude Code, Cursor y Copilot
tienen planes pagos). Vercel y Render tienen planes gratuitos.

**¿Qué pasa con los datos de los socios?** Mientras desarrollás, todo corre en
tu computadora con personas ficticias: el asistente nunca ve datos reales. En
producción, tu app lee solo lo que el RDR aprueba, y cada persona ve qué apps
acceden a sus datos y puede retirar el acceso. La página que arma el prompt
no manda nada a ningún lado.

**¿Y si algo falla?** El asistente lee el error, prueba soluciones y, si no
puede, te explica qué pasa. Lo más común: Docker cerrado, o los puertos
54321/54322 ocupados. Nada de esto toca Mi Rotaract de verdad.

**¿Dónde pido ayuda?** En
[github.com/equipoit4845/rotaract-app/issues](https://github.com/equipoit4845/rotaract-app/issues)
(contá qué intentaste y el error) o con el equipo de Mi Rotaract del
distrito. Ver también [faq.md](faq.md).

## Para quien mantiene esto

El prompt maestro tiene una sola fuente:
`packages/ai-skills/prompts/_master.md` (con variables y bloques por
asistente), renderizada por `packages/ai-skills/src/master-prompt.js`. Las
ideas están en `prompts/_ideas.yaml` y el prompt de planificación en
`prompts/_planning.md`. El portal los publica en cada build
(`apps/developers-portal/scripts/prepare-content.mjs`): `/ia`,
`/ia/prompt.md`, `/ia/prompt-<asistente>.md`, `/ia/skills.json` y su
`.sha256`. Cuando el gate de evals apruebe, construí el portal con
`MIROTARACT_SKILLS_EVALUATED=1` para quitar el aviso de versión preliminar.
