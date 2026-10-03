# Quickstart: Next.js

En 15 minutos: una app Next.js 15 (App Router) donde la gente entra con su
cuenta de Mi Rotaract y ve el padrón de su club, contra un kernel local con
datos sintéticos. El código de esta página es el de la plantilla
`mirotaract init --template next` y se verifica en CI
(`pnpm quickstarts:check`).

**Vas a necesitar:** Node 20+, Docker y la CLI `mirotaract` instalada desde
una copia del repositorio (la CLI y el SDK todavía no están en npm; ver
[cli.md](cli.md#0-requisitos-una-vez)).

## 1. Crear el proyecto y levantar el kernel local

```bash
mirotaract init mi-app --template next --kernel-repo ~/rotaract-app
cd mi-app && npm install
mirotaract dev up --kernel-repo ~/rotaract-app
```

`dev up` levanta el kernel en `http://localhost:54321` con el "Distrito 9999
(sandbox)", registra una app de prueba y escribe `.env.local` con sus
credenciales (`MIROTARACT_CLIENT_ID`, `MIROTARACT_CLIENT_SECRET`,
`SESSION_SECRET`...). Nada de eso es real.

> ¿Sin la CLI? Copiá `.env.example` a `.env.local` y completalo con lo que te
> dio el RDR. El resto de esta página es igual.

## 2. El cliente de Mi Rotaract (solo servidor)

Todo lo que toca secretos o tokens vive en el servidor. `server-only` hace
fallar el build si un componente de cliente lo importa.

```ts runnable file=src/lib/mirotaract.ts from=packages/cli/templates/next/src/lib/mirotaract.ts
import "server-only";

import { MiRotaract, MiRotaractAuth } from "@mirotaract/sdk";
import { createMiRotaractNext } from "@mirotaract/sdk/next";

/**
 * Todo lo de Mi Rotaract vive en el SERVIDOR (`server-only` rompe el build si
 * algún componente de cliente lo importa): el secreto y los tokens nunca
 * llegan al navegador. La sesión es una cookie httpOnly cifrada.
 */

function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Falta la variable ${name}. Corré \`mirotaract dev up\` (kernel local) o completá .env.local a partir de .env.example.`,
    );
  return value;
}

/** Datos que pedimos a la persona al ingresar. Pedí solo lo que uses. */
export const LOGIN_SCOPE = "openid profile email memberships";

let auth: MiRotaractAuth | undefined;
let session: ReturnType<typeof createMiRotaractNext> | undefined;
let data: MiRotaract | undefined;

/** "Ingresar con Mi Rotaract": OIDC authorization code + PKCE. */
export function miRotaractAuth(): MiRotaractAuth {
  return (auth ??= new MiRotaractAuth({
    issuer: env("MIROTARACT_ISSUER"),
    clientId: env("MIROTARACT_CLIENT_ID"),
    clientSecret: env("MIROTARACT_CLIENT_SECRET"),
    redirectUri: `${env("APP_URL")}/auth/callback`,
    scope: LOGIN_SCOPE,
  }));
}

/** Route handlers de login/callback/logout y lectura de la sesión. */
export function miRotaractSession() {
  return (session ??= createMiRotaractNext({
    auth: miRotaractAuth(),
    secret: env("SESSION_SECRET"),
    scope: LOGIN_SCOPE,
    sessionMaxAgeSec: 8 * 60 * 60,
    errorPath: "/",
  }));
}

/**
 * API de datos con el token de servicio de la app (client_credentials).
 * Ve TODA la organización de la app (un distrito ve todos sus clubes): la
 * regla de quién puede ver qué la aplica esta app, ver `lib/clubs.ts`.
 */
export function miRotaractData(): MiRotaract {
  return (data ??= new MiRotaract({
    baseUrl: env("MIROTARACT_BASE_URL"),
    clientId: env("MIROTARACT_CLIENT_ID"),
    clientSecret: env("MIROTARACT_CLIENT_SECRET"),
  }));
}

let mobileAuth: MiRotaractAuth | undefined;

/**
 * Verificador de access tokens emitidos a TU app móvil/SPA (PUBLIC). Rechaza
 * tokens de otras apps (`client_id` distinto), así nadie te reenvía un token
 * que obtuvo para otra cosa. Sin MIROTARACT_PUBLIC_CLIENT_ID, /api/members
 * queda deshabilitado.
 */
export function mobileTokenVerifier(): MiRotaractAuth | null {
  const clientId = process.env.MIROTARACT_PUBLIC_CLIENT_ID;
  if (!clientId) return null;
  return (mobileAuth ??= new MiRotaractAuth({
    issuer: env("MIROTARACT_ISSUER"),
    clientId,
    // No se usa: esta instancia solo verifica tokens.
    redirectUri: `${env("APP_URL")}/auth/callback`,
  }));
}
```

## 3. Ingresar con Mi Rotaract

Tres route handlers: el login redirige a Mi Rotaract (PKCE, `state` y
`nonce` en una cookie cifrada), el callback canjea el código y verifica el
`id_token` contra el JWKS, y el logout es un `POST`.

```ts runnable file=src/app/auth/login/route.ts from=packages/cli/templates/next/src/app/auth/login/route.ts
import { miRotaractSession } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

/** GET /auth/login?returnTo=/padron → redirige a Mi Rotaract (PKCE + state + nonce en cookie cifrada). */
export function GET(request: Request) {
  return miRotaractSession().login(request);
}
```

```ts runnable file=src/app/auth/callback/route.ts from=packages/cli/templates/next/src/app/auth/callback/route.ts
import { miRotaractSession } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

/** GET /auth/callback: valida state, canjea el código, verifica el id_token (JWKS) y crea la sesión. */
export function GET(request: Request) {
  return miRotaractSession().callback(request);
}
```

```ts runnable file=src/app/auth/logout/route.ts from=packages/cli/templates/next/src/app/auth/logout/route.ts
import { miRotaractSession } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

/** POST /auth/logout (un formulario, no un link: así un sitio ajeno no te desloguea con un <img>). */
export function POST(request: Request) {
  return miRotaractSession().logout(request);
}
```

La dirección de regreso es `${APP_URL}/auth/callback` y tiene que estar
registrada en la app **exactamente igual** (en local ya lo está).

## 4. Leer el padrón

La API de datos se consulta con el token de servicio de la app
(`client_credentials`). La regla de quién ve qué la pone **tu** app: acá,
solo el padrón de los clubes donde la persona es socia activa.

```ts runnable file=src/lib/clubs.ts from=packages/cli/templates/next/src/lib/clubs.ts
import "server-only";

import type { MemberView, PersonMembershipView } from "@mirotaract/sdk";

import { miRotaractData } from "./mirotaract";

export type ClubRoster = {
  club: Pick<PersonMembershipView, "organizationId" | "organizationName" | "status">;
  members: MemberView[];
};

/** Membresías que habilitan a ver el padrón del club. */
const VISIBLE = new Set(["ACTIVE", "ON_LEAVE"]);

/**
 * Padrón de los clubes de una persona. La regla es de ESTA app: solo ves el
 * padrón de un club si sos socio/a activo/a (o de licencia). Las membresías
 * se consultan al kernel en el momento (no se confía en la sesión, que
 * puede tener horas), con el token de servicio.
 */
export async function rostersFor(personId: string): Promise<ClubRoster[]> {
  const mr = miRotaractData();
  const memberships = await mr.persons.memberships(personId);
  const clubs = memberships.filter(
    (m) => m.organizationType === "CLUB" && VISIBLE.has(m.status),
  );
  return Promise.all(
    clubs.map(async (club) => ({
      club: {
        organizationId: club.organizationId,
        organizationName: club.organizationName,
        status: club.status,
      },
      members: (
        await mr.members.list(club.organizationId, { limit: 100 }).all({ max: 1000 })
      )
        .filter((m) => VISIBLE.has(m.status))
        .sort((a, b) => a.person.displayName.localeCompare(b.person.displayName, "es")),
    })),
  );
}
```

```tsx runnable file=src/app/padron/page.tsx from=packages/cli/templates/next/src/app/padron/page.tsx
import { MiRotaractApiError } from "@mirotaract/sdk";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { rostersFor, type ClubRoster } from "@/lib/clubs";
import { miRotaractSession } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { ACTIVE: "Activo/a", ON_LEAVE: "De licencia" };

export default async function Padron() {
  const session = await miRotaractSession().getSession(await cookies());
  if (!session) redirect("/auth/login?returnTo=/padron");

  let rosters: ClubRoster[];
  try {
    rosters = await rostersFor(session.user.sub);
  } catch (error) {
    // Nunca muestres detalles internos; el traceId sirve para pedir ayuda al RDR.
    const detail = error instanceof MiRotaractApiError ? ` (HTTP ${error.status}, traceId ${error.traceId ?? "-"})` : "";
    return (
      <>
        <h1>Padrón</h1>
        <p className="error">No pudimos leer el padrón{detail}.</p>
        <Link href="/">Volver</Link>
      </>
    );
  }

  return (
    <>
      <p>
        <Link href="/">← Inicio</Link>
      </p>
      <h1>Padrón de mi club</h1>
      {rosters.length === 0 && (
        <p className="muted">No tenés una membresía activa en ningún club de esta app.</p>
      )}
      {rosters.map(({ club, members }) => (
        <section key={club.organizationId}>
          <h2>{club.organizationName}</h2>
          <p className="muted">{members.length} socios/as</p>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>N.º</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.membershipId}>
                  <td>{member.person.displayName}</td>
                  <td>{member.memberNumber ?? "—"}</td>
                  <td>{STATUS[member.status] ?? member.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}
```

## 5. Probar

```bash
npm run dev
```

Abrí `http://localhost:3000`, tocá **Ingresar con Mi Rotaract** y entrá con
`socio.norte@example.org` / `sandbox-9999`. Vas a ver el padrón del club
sintético. Si algo falla, el `traceId` del error te lleva a su registro en la
consola local (`http://localhost:54322/developer/apps` → tu app →
**Registros**).

## 6. Antes de producción

- Pedile al RDR una app real con los mismos scopes y la dirección de regreso
  de producción, y cargá las variables en tu hosting (nunca en el repo).
- Revisá la [checklist de seguridad](seguridad.md).
- Webhooks: la plantilla trae `src/app/api/webhooks/route.ts` con la firma
  verificada; ver [webhooks.md](webhooks.md).
