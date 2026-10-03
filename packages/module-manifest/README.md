# @mirotaract/module-manifest

Contrato del manifiesto de módulos de **Mi Rotaract** (`mirotaract.module.json`, v1).

- `schema/module-manifest.v1.json`: JSON Schema (draft-07). Publicado en
  `https://developers.rotaract4845.com/schemas/module-manifest.v1.json`.
- `validateManifest(json, { knownEventTypes? }) → { ok, errors[] }`: forma del
  manifiesto + reglas que JSON Schema no expresa (permisos y eventos propios
  con el prefijo `<id>.`, códigos únicos, `configurationSchema` compilable,
  `https` en `ui.entryUrl`).
- `validateConfiguration(configurationSchema, value) → { ok, errors[], value }`:
  la misma validación que hace el kernel al instalar o configurar un módulo
  en un club. Los errores vienen en español y usan el `title` de cada campo.
- Tipos TypeScript en `src/index.d.ts` (`ModuleManifest`, `ValidationError`...).

```bash
npx mirotaract-module check                    # ./mirotaract.module.json
npx mirotaract-module check otro.json --json   # { ok, errors } para CI
npx mirotaract-module check --events https://api.rotaract4845.com/api/kernel/v1/events/catalog
```

Sale con 0 (válido), 1 (errores) o 2 (no se pudo leer).

Ejemplo completo: [`examples/reuniones/mirotaract.module.json`](examples/reuniones/mirotaract.module.json).
Guía: [`docs/developers/modulos.md`](../../docs/developers/modulos.md). Diseño:
[`docs/15-modules.md`](../../docs/15-modules.md).

> El kernel no importa este paquete (su imagen no incluye paquetes del
> workspace): guarda una copia del esquema en
> `apps/institutional-kernel-api/src/application/modules/`, y un test del
> kernel verifica que sea idéntica.
