<!-- doc
Prompt maestro de "Creá tu solución para Rotaract con IA" (fuente única).

Lo usan la página https://developers.rotaract4845.com/ia (formulario en vivo),
/ia/prompt.md (versión genérica) y llms-full.txt. Se arma con
renderMasterPrompt() de src/master-prompt.js:

- {{VARIABLE}}: se reemplaza una sola vez (lo que escribe la persona nunca se
  vuelve a interpretar como plantilla).
- <!-- if: cond --> … <!-- else --> … <!-- /if -->: bloques condicionales,
  anidables. cond = bandera, !bandera o a|b.
- Banderas: claude, cursor, copilot, otro (asistente elegido; en la versión
  genérica, "auto", están todas encendidas), auto, idea, users, data, club,
  distrito, template_next, template_fastapi.

Este comentario no forma parte del prompt.
-->
# Creá mi solución para Rotaract

Hola. Soy parte de Rotaract (Distrito 4845) y quiero construir una app
conectada a **Mi Rotaract**, el sistema del distrito que sabe quién es quién:
personas, clubes, membresías, períodos, cargos y autoridades. Puede que no sea
programador/a: hablame en castellano simple y explicá en una línea cualquier
término técnico la primera vez que lo uses.

Vos sos {{ASSISTANT_NAME}} y podés correr comandos en mi computadora. Quiero
que hagas casi todo solo, con la mejor arquitectura posible, siguiendo las
herramientas oficiales de Mi Rotaract. Seguí estas instrucciones en orden.

<!-- if: idea -->
## Mi idea

- **Qué quiero construir:** {{IDEA}}
<!-- if: users -->
- **Quién la va a usar:** {{USERS}}
<!-- /if -->
<!-- if: data -->
- **Qué datos necesita:** {{DATA}}
<!-- /if -->
<!-- if: club -->
- **Alcance:** es para un club (o para que cada club la use con sus propios datos).
<!-- /if -->
<!-- if: distrito -->
- **Alcance:** es para todo el distrito.
<!-- /if -->
<!-- if: template_next -->
- **Sugerencia:** plantilla `next` (Next.js).
<!-- /if -->
<!-- if: template_fastapi -->
- **Sugerencia:** plantilla `fastapi` (Python).
<!-- /if -->

Si algo de esto es ambiguo, decidí vos lo razonable y anotalo en el plan; no
me hagas preguntas que puedas responder con sentido común.
<!-- else -->
## Mi idea

Todavía no te la conté. Antes de empezar, preguntame **en un solo mensaje**:
qué quiero construir, quién la va a usar, qué datos necesita y si es para un
club o para todo el distrito. Con eso, seguí sin más preguntas.
<!-- /if -->

## Reglas para trabajar conmigo

1. **Preguntame solo lo que es decisión mía:** aprobar el plan, cualquier cosa
   que cueste dinero o abra cuentas a mi nombre, instalar programas que pidan
   mi contraseña de administrador, quién es la persona responsable de la app y
   sus datos de contacto, y el nombre o dominio público. Todo lo demás
   (nombres de archivos, librerías, diseño de la base, textos de la interfaz)
   decidilo vos y anotalo en `PLAN.md` en "Decisiones que tomé".
2. **Nunca uses datos personales reales** mientras desarrollás. Todo se prueba
   contra el kernel local con el distrito sintético "Distrito 9999", con
   cuentas `@example.org`. No apuntes la app a producción
   (`api.rotaract4845.com`) hasta el paso 9.
3. **Contame qué hacés** en mensajes cortos, al terminar cada paso. Si un
   comando tarda (instalaciones, la primera construcción del kernel), corrélo
   en segundo plano si podés, avisame cuánto puede tardar y seguí con lo que
   no dependa de él. No lo interrumpas por impaciencia.
4. **Si algo falla**, leé el error completo, buscá la causa (la documentación
   y el servidor MCP ayudan) y probá una solución. Si después de dos intentos
   sigue fallando, explicame en simple qué pasa, qué probaste y qué necesito
   hacer yo. Nunca "arregles" algo desactivando una verificación de
   seguridad.
5. **Trabajá en la carpeta actual**, que es la carpeta de la app (tendría
   que estar vacía, salvo archivos de configuración de tu asistente). Si
   tiene otro proyecto adentro, pedime que cree una carpeta nueva y vuelva a
   abrir el asistente ahí: tus skills y el servidor MCP se cargan desde la
   carpeta en la que te abrí.
6. Sistema operativo: detectalo vos (`uname -a` o equivalente). En Windows,
   trabajá dentro de **WSL2** (Ubuntu): la CLI y Docker andan mejor ahí.

En todo este prompt, `mirotaract` significa `npx --yes @mirotaract/cli@latest`
(la CLI oficial, publicada en npm). Si preferís, instalala una vez con
`npm install -g @mirotaract/cli@latest` y usá `mirotaract` directo.

## Paso 1 · Revisar lo que hace falta en la computadora

Corré y mostrame un resumen de una línea por herramienta:

```bash
node --version          # hace falta 20 o más
npm --version
git --version
docker --version
docker compose version  # Docker Compose v2
docker info --format '{{.ServerVersion}}'   # confirma que Docker está corriendo
```

<!-- if: template_fastapi -->
Como la idea sugiere Python, revisá también `python3 --version` (3.10 o más).
<!-- else -->
Si al planificar elegís la plantilla `fastapi`, revisá también
`python3 --version` (3.10 o más).
<!-- /if -->

Si falta algo, explicame cómo instalarlo **según mi sistema** y esperá a que
te confirme antes de seguir con lo que lo necesite (podés avanzar con el resto):

- **macOS:** Node LTS desde https://nodejs.org (o `brew install node`), git
  con `xcode-select --install`, Docker Desktop desde
  https://www.docker.com/products/docker-desktop/.
- **Windows:** en PowerShell como administrador, `wsl --install` y reiniciar;
  Docker Desktop con la integración WSL2 activada; dentro de Ubuntu:
  `sudo apt update && sudo apt install -y git` y Node con nvm
  (https://github.com/nvm-sh/nvm, después `nvm install --lts`).
- **Linux:** Node con nvm (`nvm install --lts`), git con el gestor de paquetes,
  Docker Engine desde https://docs.docker.com/engine/install/ y agregar mi
  usuario al grupo `docker` (hay que cerrar sesión y volver a entrar).

Si Docker está instalado pero no corre, decime que abra Docker Desktop (o
`sudo systemctl start docker` en Linux). El kernel local necesita unos 6 GB
libres en disco y 4 GB de memoria para Docker.

## Paso 2 · Leer la documentación antes de escribir código

La documentación oficial está pensada para asistentes como vos:

- Índice: https://developers.rotaract4845.com/llms.txt
- Todo en un archivo: https://developers.rotaract4845.com/llms-full.txt (si es
  muy largo para leerlo entero, empezá por el índice y abrí las guías que
  apliquen).
- Cada guía en Markdown: `https://developers.rotaract4845.com/docs/<guía>.md`,
  por ejemplo `conceptos`, `api-de-datos`, `ingresar-con-mi-rotaract`,
  `webhooks`, `modulos`, `seguridad` y `kit-de-ui`. Cuando más abajo diga
  "guía `/docs/x.md`", es esa dirección.

Ideas clave que tenés que respetar siempre:

- El **kernel** de Mi Rotaract es la única fuente de verdad de personas,
  clubes, membresías, períodos, cargos y autoridades. La app los **consulta
  por la API**; no los copia para "corregirlos" ni se conecta a su base.
- **"Ingresar con Mi Rotaract"** (OAuth 2.0 + OpenID Connect con PKCE) para
  que la gente entre con su cuenta del distrito.
- **API de datos** (`/service/*`) con el token de servicio de la app, solo
  desde el servidor y con los **scopes mínimos** (un scope es un permiso
  puntual, por ejemplo "leer el padrón").
- **Webhooks firmados** para enterarse de altas, bajas y cambios sin
  consultar a cada rato.

## Paso 3 · Planificar y esperar mi OK

Antes de crear nada, escribí un `PLAN.md` corto (una página) en la carpeta
actual, en castellano simple, con:

1. **Problema:** qué resuelve, en dos oraciones.
2. **Quién la usa** y qué puede hacer cada rol (por ejemplo: socio/a,
   secretaría del club, presidencia, RDR).
3. **Pantallas:** una lista con lo que se ve en cada una.
4. **Datos del kernel** que lee (padrón, autoridades, períodos, etc.), con la
   operación de la API y el scope de servicio de cada uno.
5. **Datos propios** que guarda la app (solo lo específico de la idea), en
   tablas que usan los ids del kernel (`personId`, `organizationId`) y sin
   copiar datos personales que se pueden consultar al kernel.
6. **Permisos:** scopes de "Ingresar con Mi Rotaract", scopes de servicio, y
   qué permiso del kernel se chequea en el servidor para cada acción sensible.
7. **Eventos (webhooks)** que escucha, si hacen falta, y para qué.
8. **Plantilla** (`next` o `fastapi`) y por qué; si va a ser un **módulo**
   instalable por club; qué base de datos usa (o si no necesita ninguna).
9. **Decisiones que tomé** y **lo que queda afuera** de esta primera versión.

Elegí la plantilla así: `next` (Next.js, recomendado) para casi todo, sobre
todo si tiene pantallas para socios; `fastapi` (Python) si la idea es
principalmente procesar datos, generar reportes o automatizar avisos, o si te
pedí Python. Mantené la primera versión chica: lo mínimo que ya sirva.

Mostrame el plan resumido en 8–10 líneas y **esperá mi OK**. Si te pido
cambios, actualizá `PLAN.md` y volvé a mostrarlo.

## Paso 4 · Crear la app con las herramientas oficiales

Con el plan aprobado, creá la app en la carpeta actual (el nombre, corto,
en minúsculas y con guiones, por ejemplo `inscripciones-conferencia`):

```bash
mirotaract init . --name <nombre> --template <next|fastapi> --ai {{SKILLS_TARGET}} --force
```

(`--force` hace falta porque la carpeta ya tiene `PLAN.md`; la plantilla no
trae un archivo con ese nombre, así que no lo pisa.)

<!-- if: auto -->
Para `--ai`, usá el destino de tu asistente: `claude` (Claude Code), `cursor`
(Cursor), `copilot` (VS Code con GitHub Copilot) o `agents` (Codex, Gemini,
Zed, Jules u otros que leen `AGENTS.md`).

<!-- /if -->
Eso crea la app con "Ingresar con Mi Rotaract", el padrón del club de
ejemplo, `.env.example`, `README.md`, un `AGENTS.md` con el checklist de
seguridad, y las **skills de Mi Rotaract** (instrucciones por tarea para vos).

- Si `--ai` falla diciendo que no encuentra `@mirotaract/ai-skills`, tu caché
  tiene una versión vieja de la CLI: corré
  `npx --yes @mirotaract/cli@latest ai install --target {{SKILLS_TARGET}} .`
- Si eso tampoco existe, bajá el paquete de skills a mano: descargá
  https://developers.rotaract4845.com/ia/skills.json y su suma en
  https://developers.rotaract4845.com/ia/skills.json.sha256, verificá que el
  SHA-256 coincida, y escribí cada archivo de `targets.{{SKILLS_TARGET}}` en
  su `path` (si el archivo ya existe y la entrada dice `managed: true`,
  agregá el bloque al final en vez de pisarlo).
- Con la plantilla `fastapi`: el SDK de Python es `mirotaract[fastapi]` de
  PyPI (Python ≥ 3.10); si `pip` no lo encuentra, revisá la versión de Python.
- Las skills son una **versión preliminar**: todavía no pasaron las
  evaluaciones automáticas. Usalas, pero si contradicen la documentación,
  manda la documentación.

<!-- if: auto -->
Después leé `AGENTS.md` y las skills instaladas (en `.claude/skills/`,
`.cursor/rules/` o `.github/instructions/`, según el destino) antes de seguir.
<!-- else -->
<!-- if: claude -->
Después leé `AGENTS.md` y las skills instaladas (`.claude/skills/*/SKILL.md`)
antes de seguir.
<!-- /if -->
<!-- if: cursor -->
Después leé `AGENTS.md` y las reglas instaladas (`.cursor/rules/*.mdc`) antes
de seguir.
<!-- /if -->
<!-- if: copilot -->
Después leé `AGENTS.md`, `.github/copilot-instructions.md` y
`.github/instructions/` antes de seguir.
<!-- /if -->
<!-- if: otro -->
Después leé `AGENTS.md` completo (ahí quedaron las skills) antes de seguir.
<!-- /if -->
<!-- /if -->
<!-- if: claude -->
Creá también un `CLAUDE.md` con la línea `@AGENTS.md`, para que las próximas
sesiones de Claude Code carguen ese contexto solas.
<!-- /if -->

### Conectar el servidor MCP de Mi Rotaract

El servidor MCP (`@mirotaract/mcp`) te da herramientas para buscar en la
documentación (`search_docs`, `read_doc`), describir cualquier operación de la
API (`describe_operation`), listar permisos y eventos (`list_permissions`,
`list_events`), validar el manifiesto de un módulo
(`validate_module_manifest`), generar tipos (`generate_types`) y, contra el
kernel local, crear apps y tokens de prueba. Nunca devuelve datos personales.

<!-- if: auto -->
Configuralo en la carpeta de la app según tu asistente:

<!-- /if -->
<!-- if: claude -->
<!-- if: auto -->
**Claude Code:**
<!-- /if -->
Creá `.mcp.json` en la raíz de la app (equivale a
`claude mcp add mirotaract --scope project --env MIROTARACT_BASE_URL=http://localhost:54321/api/kernel/v1 -- npx -y @mirotaract/mcp`):

```json
{
  "mcpServers": {
    "mirotaract": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@mirotaract/mcp"],
      "env": { "MIROTARACT_BASE_URL": "http://localhost:54321/api/kernel/v1" }
    }
  }
}
```

Al reiniciar, Claude Code te pide aprobar el servidor del proyecto: decime
que acepte `mirotaract`.

<!-- /if -->
<!-- if: cursor -->
<!-- if: auto -->
**Cursor:**
<!-- /if -->
Creá `.cursor/mcp.json` en la raíz de la app:

```json
{
  "mcpServers": {
    "mirotaract": {
      "command": "npx",
      "args": ["-y", "@mirotaract/mcp"],
      "env": { "MIROTARACT_BASE_URL": "http://localhost:54321/api/kernel/v1" }
    }
  }
}
```

Después hay que activarlo en **Settings → MCP** (decime que lo haga si vos
no podés).

<!-- /if -->
<!-- if: copilot -->
<!-- if: auto -->
**VS Code con GitHub Copilot (modo agente):**
<!-- /if -->
Creá `.vscode/mcp.json` en la raíz de la app:

```json
{
  "servers": {
    "mirotaract": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@mirotaract/mcp"],
      "env": { "MIROTARACT_BASE_URL": "http://localhost:54321/api/kernel/v1" }
    }
  }
}
```

VS Code muestra un botón **Start** arriba del archivo; decime que lo toque si
vos no podés iniciarlo.

<!-- /if -->
<!-- if: otro -->
<!-- if: auto -->
**Codex y otros asistentes:**
<!-- /if -->
Agregá el servidor en la configuración MCP de tu asistente. En Codex, en
`~/.codex/config.toml`:

```toml
[mcp_servers.mirotaract]
command = "npx"
args = ["-y", "@mirotaract/mcp"]
env = { MIROTARACT_BASE_URL = "http://localhost:54321/api/kernel/v1" }
```

En cualquier otro: comando `npx`, argumentos `-y @mirotaract/mcp`, variable
`MIROTARACT_BASE_URL=http://localhost:54321/api/kernel/v1`, transporte stdio.

<!-- /if -->
Comprobá que arranca con
`MIROTARACT_BASE_URL=http://localhost:54321/api/kernel/v1 npx -y @mirotaract/mcp < /dev/null`
(tiene que decir "listo (stdio)" y terminar). Casi todos los asistentes cargan
los servidores MCP al iniciar: si sus herramientas no aparecen en esta sesión,
avisame en una línea que reinicie el asistente cuando me quede cómodo y,
mientras tanto, seguí con la documentación web. No te frenes por esto.

## Paso 5 · Levantar el kernel local con datos de prueba

El kernel local es una copia de Mi Rotaract que corre en Docker en mi
computadora, con un distrito inventado (Distrito 9999: 6 clubes, 60 personas
ficticias). Se construye desde el repositorio público:

```bash
git clone --depth 1 https://github.com/equipoit4845/rotaract-app.git ~/mirotaract-kernel
# (si ya existe: cd ~/mirotaract-kernel && git pull)
```

Desde la carpeta de la app (la actual):

```bash
mirotaract dev up --kernel-repo ~/mirotaract-kernel   # con fastapi, agregá: --app-url http://localhost:8000
```

**Avisame antes:** la primera vez tarda **10 a 15 minutos** (construye las
imágenes de Docker); las siguientes, menos de un minuto. Corrélo en segundo
plano y mientras tanto empezá el paso 6. Al terminar escribe `.env.local`
con las credenciales de una app de prueba y muestra las cuentas de prueba
(contraseña de todas: `sandbox-9999`); `mirotaract dev status` las vuelve a
mostrar. Si falla, revisá que Docker esté corriendo y que los puertos 54321 y
54322 estén libres (se cambian con `--api-port` y `--web-port`), y probá
`mirotaract dev reset`.

## Paso 6 · Construir la app

Trabajá en pasos chicos que se puedan probar. Esta es la arquitectura que
tenés que seguir:

- **Sesión del lado del servidor con el SDK oficial** (`@mirotaract/sdk` en
  Next.js, el paquete `mirotaract` en Python), como ya viene en la plantilla.
  Nada de tokens en `localStorage`, `sessionStorage` ni en el navegador; no
  reemplaces la verificación del SDK por un decode manual.
- **API de datos solo desde el servidor**, con las credenciales de la app
  (`MIROTARACT_CLIENT_ID` / `MIROTARACT_CLIENT_SECRET`) y el cliente del SDK.
  Las reglas de quién ve qué las pone tu app: chequeá en el servidor el
  permiso del kernel que corresponda (skill de permisos,
  `POST /service/authorization/check`) y fallá cerrado.
- **Scopes mínimos**: cada scope con un uso que puedas explicar en una
  oración. No pidas datos de contacto salvo que la idea sea contactar gente.
- **Webhooks para sincronizar**, si hace falta enterarse de cambios: verificá
  la firma con el SDK sobre el cuerpo crudo, deduplicá por `event.id` y
  respondé rápido. En local: `mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks`
  (con fastapi, puerto 8000) y copiá el secreto `whsec_…` que imprime a
  `MIROTARACT_WEBHOOK_SECRET` en `.env.local`.
- **Base de datos propia solo para lo propio de la app**, con los ids del
  kernel como claves y sin copias de datos personales más allá de lo
  imprescindible. Si la idea no necesita guardar nada, no agregues base.
  Si necesita: PostgreSQL. En desarrollo, un contenedor de Docker en un puerto
  libre (por ejemplo 54330) definido en un `docker-compose.yml` de la app; en
  producción, un Postgres administrado. Next.js: Drizzle ORM; FastAPI:
  SQLAlchemy. Variable `DATABASE_URL`.
<!-- if: club -->
- **Módulo instalable por club**: como la idea es para clubes, escribí
  `mirotaract.module.json` (permisos propios, configuración por club; guía
  `/docs/modulos.md`) y validalo con la herramienta MCP
  `validate_module_manifest` o con
  `npx -y @mirotaract/module-manifest check mirotaract.module.json`.
<!-- else -->
- **Módulo**: si la idea sirve para que cada club la instale con su propia
  configuración, escribí `mirotaract.module.json` (guía `/docs/modulos.md`) y
  validalo con la herramienta MCP `validate_module_manifest` o con
  `npx -y @mirotaract/module-manifest check mirotaract.module.json`.
<!-- /if -->
- **Que se vea como Mi Rotaract**: en Next.js, usá el kit de UI oficial
  (guía `/docs/kit-de-ui.md`). Primero `npx shadcn@latest init`, después
  `npx shadcn@latest add https://developers.rotaract4845.com/r/mirotaract-theme.json`
  y los componentes que uses (`app-shell`, `page-header`, `data-table`,
  `status-badge`, `confirm-dialog`, `empty-state`), siempre con
  `https://developers.rotaract4845.com/r/<componente>.json`. En FastAPI, usá
  los colores y la tipografía (Public Sans) del tema.
- **Interfaz en castellano** (voseo, como Mi Rotaract), clara, que funcione
  bien en el celular, con estados de carga, vacío y error.
- **Tests** de las reglas importantes (permisos, verificación de webhooks,
  lógica propia): Vitest en Next.js, pytest en FastAPI.
- **README.md** para personas: qué hace, cómo correrla en local y cómo
  probarla.

Usá el servidor MCP (`describe_operation`, `list_permissions`, `list_events`)
o la documentación para no adivinar nombres de operaciones, scopes ni eventos.
<!-- if: template_next -->
Si te sirve, `mirotaract gen types` genera los tipos TypeScript de la API.
<!-- /if -->

## Paso 7 · Revisar la seguridad

1. Repasá el **checklist de seguridad** de `AGENTS.md` (está también al final
   de cada skill) punto por punto, y mostrame la lista marcando qué estaba bien y qué
   corregiste.
2. Corré los **evaluadores automáticos** de Mi Rotaract sobre la app, los que
   apliquen:

   ```bash
   (cd ~/mirotaract-kernel && npx --yes pnpm@10.13.1 install --filter "@mirotaract/evals...")
   node ~/mirotaract-kernel/evals/bin/evals.js run --task login-nextjs --solution "$PWD"     # si tiene login (Next.js)
   node ~/mirotaract-kernel/evals/bin/evals.js run --task padron-club --solution "$PWD"      # si lee el padrón
   node ~/mirotaract-kernel/evals/bin/evals.js run --task webhooks-altas --solution "$PWD"   # si recibe webhooks
   node ~/mirotaract-kernel/evals/bin/evals.js run --task manifiesto-modulo --solution "$PWD" # si es un módulo
   ```

   Fueron escritos para tareas de ejemplo: corregí **todas** las fallas de
   seguridad (tokens en el navegador, verificación de tokens o de firmas,
   secretos, datos personales en logs). Si una falla de "scopes mínimos" se
   debe a un scope que tu idea realmente necesita, explicame por qué.
3. Corré los tests y el build (`npm run typecheck`, `npm test` y
   `npm run build` en Next.js; `pytest` en FastAPI) hasta que pasen.

## Paso 8 · Mostrármela funcionando

Levantá la app (`npm run dev` → http://localhost:3000, o
`.venv/bin/uvicorn app.main:app --reload --port 8000` → http://localhost:8000)
y explicame cómo probarla, paso a paso, con las cuentas de prueba que
correspondan a cada rol (todas con contraseña `sandbox-9999`), por ejemplo:

- `socio.norte@example.org`: socio/a de Sandbox Norte;
- `secretaria.norte@example.org` y `presidencia.norte@example.org`: secretaría
  y presidencia de ese club;
- `socio.sur@example.org`: de otro club (sirve para comprobar que no ve lo que
  no debe);
- `rdr@example.org`: Representante Distrital.

Decime qué debería ver en cada caso. Si te digo que algo no anda, arreglalo.

## Paso 9 · Dejarla lista para producción

Cuando te diga que me gusta como quedó:

1. **`.env.example`** completo y comentado (sin valores reales), y verificá
   que `.env.local` está en `.gitignore`.
2. **`DEPLOY.md`**: cómo publicarla, paso a paso para alguien que no
   programa, en el servicio más simple para la plantilla:
   - Next.js → **Vercel** (importar el repositorio de GitHub; plan gratuito).
   - FastAPI → **Render** (Web Service con
     `uvicorn app.main:app --host 0.0.0.0 --port $PORT`); Railway o Fly.io
     como alternativas.
   - Base de datos, si hay: Postgres administrado (Neon, Supabase o el del
     mismo servicio).
   - Variables de entorno a cargar: `MIROTARACT_ISSUER` y
     `MIROTARACT_BASE_URL` = `https://api.rotaract4845.com/api/kernel/v1`,
     `MIROTARACT_CLIENT_ID`, `MIROTARACT_CLIENT_SECRET`,
     `MIROTARACT_ORGANIZATION_ID`, `APP_URL` (la dirección pública),
     `SESSION_SECRET` (32+ caracteres aleatorios), `MIROTARACT_WEBHOOK_SECRET`
     si usa webhooks, `DATABASE_URL` si usa base.
   - La dirección de regreso que hay que registrar: `<APP_URL>/auth/callback`;
     y la del webhook: `<APP_URL>/api/webhooks`.
3. **`REVISION-RDR.md`**: el texto para el formulario de revisión que completa
   el RDR antes de aprobar la app (guía `/docs/revision-de-apps.md`):
   nombre y descripción corta; **propósito**; organización (club o distrito);
   tipo (app de servidor); **datos que pide**, cada scope con su porqué;
   permisos del kernel que chequea; eventos que recibe; direcciones de
   regreso y de webhook; **persona responsable**; **política de privacidad**
   (escribí un borrador corto en `PRIVACIDAD.md`: qué guarda, para qué, por
   cuánto tiempo y cómo pedir que se borre); y **contacto**. Para la persona
   responsable y el contacto, preguntame.
4. Explicame los pasos que siguen, que son míos: subir el código a GitHub,
   mandarle `REVISION-RDR.md` al RDR para que registre y apruebe la app
   (guías `/docs/registrar-una-app.md` y `/docs/revision-de-apps.md`; los
   límites de uso están en `/docs/limites.md`), cargar en el servicio de
   hosting las credenciales que me dé, publicar y, cuando el RDR la apruebe,
   pedir que **aparezca en el panel de los socios** de Mi Rotaract.

Al final, dame un resumen corto: qué construiste, cómo probarla, qué quedó
pendiente y qué tengo que hacer yo.
