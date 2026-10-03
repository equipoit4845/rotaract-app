# Quickstart: Express

En 15 minutos: una API Express que recibe el access token de tu SPA o app
móvil, lo verifica con Mi Rotaract y devuelve el padrón del club de la
persona, más un endpoint de webhooks con la firma verificada. Usa
`@mirotaract/sdk` y `@mirotaract/sdk/express`. El código de esta página se
verifica en CI (`pnpm quickstarts:check`).

**Vas a necesitar:** Node 20+, Docker y la CLI `mirotaract` instalada desde
una copia del repositorio, con el SDK compilado (la CLI y el SDK todavía no
están en npm; ver [cli.md](cli.md#0-requisitos-una-vez)).

## 1. Kernel local y proyecto

```bash
mkdir mi-api && cd mi-api
npm init -y && npm pkg set type=module
npm install express ~/rotaract-app/packages/sdk-js
npm install -D typescript tsx @types/express @types/node

# Kernel local con el Distrito 9999 (sandbox) y dos apps de prueba:
mirotaract dev up --kernel-repo ~/rotaract-app
```

`dev up` escribe `.env.local` con `MIROTARACT_BASE_URL`,
`MIROTARACT_CLIENT_ID` y `MIROTARACT_CLIENT_SECRET` de la app de servidor, y
`MIROTARACT_PUBLIC_CLIENT_ID` de la app `PUBLIC` (móvil/SPA) cuyos tokens va
a aceptar tu API. En producción, esos valores te los da el RDR.

## 2. Los clientes

`MiRotaract` usa el secreto (solo servidor) para la API de datos;
`MiRotaractAuth` sin secreto verifica los tokens que te manda tu app móvil.

```ts runnable file=src/mirotaract.ts
import { MiRotaract, MiRotaractAuth } from "@mirotaract/sdk";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name} (ver .env.local)`);
  return value;
}

/** API de datos con el token de servicio de esta app (client_credentials). */
export const data = new MiRotaract({
  baseUrl: env("MIROTARACT_BASE_URL"),
  clientId: env("MIROTARACT_CLIENT_ID"),
  clientSecret: env("MIROTARACT_CLIENT_SECRET"),
});

/**
 * Verifica access tokens emitidos a TU app móvil/SPA (PUBLIC): rechaza los
 * de otras apps. No tiene secreto; la redirectUri no se usa para verificar.
 */
export const mobileAuth = new MiRotaractAuth({
  issuer: env("MIROTARACT_BASE_URL"),
  clientId: env("MIROTARACT_PUBLIC_CLIENT_ID"),
  redirectUri: "http://localhost/no-se-usa",
});
```

## 3. La API

```ts runnable file=src/server.ts
import express from "express";
import { MiRotaractApiError, type MemberView } from "@mirotaract/sdk";
import { miRotaractWebhook, requireMiRotaractUser } from "@mirotaract/sdk/express";

import { data, mobileAuth } from "./mirotaract.js";

const app = express();
const VISIBLE = new Set(["ACTIVE", "ON_LEAVE"]);

/** Padrón de los clubes donde la persona es socia activa (regla de ESTA app). */
async function rostersFor(personId: string) {
  const memberships = await data.persons.memberships(personId);
  const clubs = memberships.filter(
    (m) => m.organizationType === "CLUB" && VISIBLE.has(m.status),
  );
  return Promise.all(
    clubs.map(async (club) => {
      const members: MemberView[] = await data.members
        .list(club.organizationId, { limit: 100 })
        .all({ max: 1000 });
      return {
        club: club.organizationName,
        members: members
          .filter((m) => VISIBLE.has(m.status))
          .map((m) => ({ name: m.person.displayName, status: m.status })),
      };
    }),
  );
}

// Bearer = access token de tu app móvil. "userinfo" ve revocaciones al instante.
app.get(
  "/api/padron",
  requireMiRotaractUser({ auth: mobileAuth, verify: "userinfo" }),
  async (req, res, next) => {
    try {
      const { user } = req.miRotaract!; // lo deja requireMiRotaractUser
      res.set("Cache-Control", "no-store").json(await rostersFor(user.sub));
    } catch (error) {
      if (error instanceof MiRotaractApiError)
        // Nunca muestres detalles internos; el traceId sirve para buscar el registro.
        return void res
          .status(502)
          .json({ error: "kernel_error", traceId: error.traceId ?? null });
      next(error);
    }
  },
);

// Webhooks: cuerpo CRUDO (la firma es sobre esos bytes).
app.post(
  "/api/webhooks/mirotaract",
  express.raw({ type: "application/json" }),
  miRotaractWebhook({ secret: process.env.MIROTARACT_WEBHOOK_SECRET ?? "" }),
  (req, res) => {
    const event = req.miRotaractEvent!; // verificado por miRotaractWebhook
    console.log("webhook", event.type, event.id); // deduplicá por event.id
    res.sendStatus(200);
  },
);

app.listen(4000, () => console.log("API en http://localhost:4000"));
```

## 4. Probar

```bash
node --env-file=.env.local --import tsx src/server.ts
```

Sin token responde `401 { "error": "invalid_token" }`. Con el access token
de tu app móvil (por ejemplo, el de la plantilla `flutter` contra este
kernel local):

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:4000/api/padron
```

Para probar los webhooks en local:
`mirotaract webhooks listen --forward-to http://localhost:4000/api/webhooks/mirotaract`
y poné en `MIROTARACT_WEBHOOK_SECRET` el secreto que imprime.

## 5. Antes de producción

- `verify: "userinfo"` consulta a Mi Rotaract en cada pedido (con caché de
  60 s). `verify: "jwt"` no usa la red pero no ve una revocación hasta que el
  token vence (10 minutos).
- Guardá los `event.id` de los webhooks para no procesar dos veces el mismo.
- Revisá la [checklist de seguridad](seguridad.md).
