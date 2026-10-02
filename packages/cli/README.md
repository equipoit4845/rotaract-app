# @mirotaract/cli

CLI de **Mi Rotaract** para quienes construyen apps conectadas al kernel del
distrito. Node 20+.

```bash
mirotaract init mi-app --template next|fastapi|flutter [--kernel-repo <ruta>]
mirotaract dev up|down|reset|status [--kernel-repo <ruta>] [--api-port 54321] [--web-port 54322]
mirotaract gen types [--lang ts|python] [--out <archivo>]
mirotaract webhooks listen --forward-to http://localhost:3000/api/webhooks [--events a,b]
mirotaract --help
```

- `init`: plantilla con "Ingresar con Mi Rotaract", el padrón del club vía la
  API de datos, `.env.example`, README y `AGENTS.md` (checklist de
  seguridad).
- `dev`: kernel local en Docker (proyecto `mirotaract-dev`: postgres, nats,
  API y web) con el distrito sintético "Distrito 9999 (sandbox)", cuentas de
  prueba por rol (contraseña `sandbox-9999`) y una app local cuyas
  credenciales se escriben en `.env.local`.
- `gen types`: tipos de la API (openapi-typescript) y del catálogo de
  eventos; `--lang python` genera `TypedDict`.
- `webhooks listen`: reenvía a tu servidor local, firmados, los eventos de tu
  app, con reconexión automática.

Guía: [`docs/developers/cli.md`](../../docs/developers/cli.md). Diseño:
[`docs/14-cli-and-local-kernel.md`](../../docs/14-cli-and-local-kernel.md).

> Todavía no está publicada en npm (`"private": true`). Desde el repo:
> `npm install -g ./packages/cli` después de `npx pnpm@10.13.1 install`.

## Desarrollo

```bash
pnpm --filter @mirotaract/cli test     # node:test, sin Docker ni red
node test/support/mock-kernel.mjs 4010 # mock del contrato (stream SSE, catálogo, openapi)
```
