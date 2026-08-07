# Seeds e importación de datos

## Seed institucional base

`pnpm db:seed` ejecuta [`prisma/seed.ts`](../prisma/seed.ts). Es idempotente y
carga el catálogo de permisos, roles técnicos, definiciones de cargos y el
módulo base de reuniones. Puede aprovisionar el primer `SUPERADMIN` sólo si se
configuran `KERNEL_SUPERADMIN_EMAIL` y `KERNEL_SUPERADMIN_PASSWORD`.

## Importación legacy: usuarios, clubes y membresías

[`prisma/seed-legacy.ts`](../prisma/seed-legacy.ts) lee un dump PostgreSQL
legacy. Su alcance es deliberadamente reducido:

- `public."User"` → `Person` y `UserAccount`;
- `public."Club"` → `Organization`;
- `public."Membership"` → `OrganizationMembership` y transición inicial.

El registro legacy `Distrito Ejemplo` se excluye como club. El importador crea
`Distrito 4845` y hace a los clubes hijos de esa organización. Las dos
membresías legacy que apuntaban al registro de distrito se reasignan al nuevo
distrito.

No importa `auth.*`, `storage.*`, sesiones, tokens, `Member`, solicitudes,
transferencias, períodos o cargos legacy.

```bash
# Sólo lectura del dump; no abre conexión al Kernel.
LEGACY_IMPORT_DUMP_PATH=/ruta/mi_rotaract.sql pnpm db:seed:legacy:dry-run

# Escritura explícita y transaccional.
LEGACY_IMPORT_DUMP_PATH=/ruta/mi_rotaract.sql \
LEGACY_IMPORT_CONFIRM=IMPORT_LEGACY_USERS_AND_CLUBS \
pnpm db:seed:legacy
```

El importador rechaza emails/códigos de club duplicados y referencias inválidas
antes de escribir. Los hashes bcrypt se preservan y el login los convierte a
Argon2id al autenticarse por primera vez.

## Presidentes actuales 2026–2027

[`prisma/seed-current-presidents.ts`](../prisma/seed-current-presidents.ts)
contiene la lista verificada de presidentes actuales. El seed:

1. valida cuenta, club y membresía activa;
2. crea el período `2026-2027` activo de cada club, si no existe;
3. crea un único nombramiento `CLUB_PRESIDENT` por club;
4. materializa su rol técnico derivado;
5. crea sólo una membresía inferida para Minga Guazú, porque faltaba en el
   origen legacy.

```bash
pnpm db:seed:current-presidents:dry-run

CURRENT_PRESIDENTS_CONFIRM=IMPORT_CURRENT_CLUB_PRESIDENTS \
pnpm db:seed:current-presidents
```

El seed se ejecuta con aislamiento serializable, falla si ya hay otro período
activo o presidente activo en un club, y es repetible cuando los nombramientos
ya corresponden a la misma membresía.
