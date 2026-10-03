<!-- Generado desde apps/institutional-kernel-api/src/application/webhooks/catalog.ts
     con `pnpm docs:events`. No lo edites a mano. -->

# Catálogo de eventos

Los eventos que Mi Rotaract le puede mandar a tu app por webhook. La
misma información, en JSON y con el JSON Schema de cada tipo, está en
`GET /api/kernel/v1/events/catalog` (público, sin autenticación). Cómo
recibirlos y verificarlos: [webhooks.md](webhooks.md).

Cada tipo lleva su versión (`.v1`). Si alguna vez cambia de forma
incompatible, se publica un tipo nuevo (`.v2`) al lado del anterior; un
campo opcional nuevo no es un cambio incompatible, así que ignorá los
campos que no conozcas.

Solo recibís eventos de las organizaciones del alcance de tu app (su
club, o el distrito y sus clubes) y solo los tipos para los que la app
tiene permiso. Los datos de contacto (email, teléfono, fecha de
nacimiento) solo aparecen si la app tiene
`kernel.service.persons.contact.read`, igual que en la API de datos.

| Tipo | Qué pasó | Permiso |
|---|---|---|
| [`membership.created.v1`](#membershipcreatedv1--membresía-creada) | Membresía creada | `kernel.service.memberships.read` |
| [`membership.activated.v1`](#membershipactivatedv1--socio-activado) | Socio activado | `kernel.service.memberships.read` |
| [`membership.ended.v1`](#membershipendedv1--socio-dado-de-baja) | Socio dado de baja | `kernel.service.memberships.read` |
| [`appointment.activated.v1`](#appointmentactivatedv1--cargo-asumido) | Cargo asumido | `kernel.service.authorities.read` |
| [`appointment.ended.v1`](#appointmentendedv1--cargo-terminado) | Cargo terminado | `kernel.service.authorities.read` |
| [`organization.updated.v1`](#organizationupdatedv1--club-o-distrito-actualizado) | Club o distrito actualizado | `kernel.service.organizations.read` |
| [`organization.archived.v1`](#organizationarchivedv1--club-archivado) | Club archivado | `kernel.service.organizations.read` |
| [`person.updated.v1`](#personupdatedv1--datos-de-una-persona-actualizados) | Datos de una persona actualizados | `kernel.service.persons.read` |
| [`period.created.v1`](#periodcreatedv1--período-creado) | Período creado | `kernel.service.periods.read` |
| [`module.installed.v1`](#moduleinstalledv1--módulo-instalado) | Módulo instalado | — |
| [`module.enabled.v1`](#moduleenabledv1--módulo-activado) | Módulo activado | — |
| [`module.disabled.v1`](#moduledisabledv1--módulo-desactivado) | Módulo desactivado | — |
| [`module.configured.v1`](#moduleconfiguredv1--configuración-del-módulo-actualizada) | Configuración del módulo actualizada | — |
| [`ping.v1`](#pingv1--prueba) | Prueba | — |

Todos los cuerpos tienen la misma forma: `id` (`evt_...`, el mismo en
cada reintento), `type`, `createdAt`, `organizationId` y `data`.

## Tipos

### `membership.created.v1` — Membresía creada

Se cargó una persona en el padrón de un club. Todavía está pendiente: es socia recién cuando llega membership.activated.v1.

- **Permiso que necesita la app:** `kernel.service.memberships.read` (Leer el padrón de socios)
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `membership` | objeto | sí | Igual que MemberView de la API de datos. |
| `membership.membershipId` | string | sí |  |
| `membership.organizationId` | string | sí |  |
| `membership.personId` | string | sí |  |
| `membership.status` | string: `PENDING`, `ACTIVE`, `ON_LEAVE`, `INACTIVE`, `GRADUATED`, `TRANSFERRED` | sí |  |
| `membership.joinedAt` | string (o null) (date-time) | no |  |
| `membership.memberNumber` | string (o null) | no |  |
| `membership.person` | objeto | sí | Igual que PersonView de la API de datos. email, phone y birthDate solo aparecen si la app tiene kernel.service.persons.contact.read. |
| `membership.person.id` | string | sí |  |
| `membership.person.displayName` | string | sí |  |
| `membership.person.firstName` | string | sí |  |
| `membership.person.lastName` | string | sí |  |
| `membership.person.avatarUrl` | string (o null) | no |  |
| `membership.person.email` | string (o null) | no |  |
| `membership.person.phone` | string (o null) | no |  |
| `membership.person.birthDate` | string (o null) (date) | no |  |
| `membership.person.updatedAt` | string (date-time) | sí |  |
| `membership.updatedAt` | string (date-time) | sí |  |
| `previousStatus` | string (o null): `PENDING`, `ACTIVE`, `ON_LEAVE`, `INACTIVE`, `GRADUATED`, `TRANSFERRED` | sí | Estado anterior de la membresía, si se conoce. |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "membership.created.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "membership": {
      "membershipId": "cm1membershipanaperez000",
      "organizationId": "cm1clubsanlorenzo0000000",
      "personId": "cm1personanaperez0000000",
      "status": "PENDING",
      "joinedAt": null,
      "memberNumber": "1042",
      "person": {
        "id": "cm1personanaperez0000000",
        "displayName": "Ana Pérez",
        "firstName": "Ana",
        "lastName": "Pérez",
        "avatarUrl": null,
        "updatedAt": "2026-10-02T21:15:04.000Z"
      },
      "updatedAt": "2026-10-02T21:15:04.000Z"
    },
    "previousStatus": null
  }
}
```

### `membership.activated.v1` — Socio activado

Una membresía pasó a activa: alta de un socio nuevo, regreso de una licencia o reincorporación.

- **Permiso que necesita la app:** `kernel.service.memberships.read` (Leer el padrón de socios)
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `membership` | objeto | sí | Igual que MemberView de la API de datos. |
| `membership.membershipId` | string | sí |  |
| `membership.organizationId` | string | sí |  |
| `membership.personId` | string | sí |  |
| `membership.status` | string: `PENDING`, `ACTIVE`, `ON_LEAVE`, `INACTIVE`, `GRADUATED`, `TRANSFERRED` | sí |  |
| `membership.joinedAt` | string (o null) (date-time) | no |  |
| `membership.memberNumber` | string (o null) | no |  |
| `membership.person` | objeto | sí | Igual que PersonView de la API de datos. email, phone y birthDate solo aparecen si la app tiene kernel.service.persons.contact.read. |
| `membership.person.id` | string | sí |  |
| `membership.person.displayName` | string | sí |  |
| `membership.person.firstName` | string | sí |  |
| `membership.person.lastName` | string | sí |  |
| `membership.person.avatarUrl` | string (o null) | no |  |
| `membership.person.email` | string (o null) | no |  |
| `membership.person.phone` | string (o null) | no |  |
| `membership.person.birthDate` | string (o null) (date) | no |  |
| `membership.person.updatedAt` | string (date-time) | sí |  |
| `membership.updatedAt` | string (date-time) | sí |  |
| `previousStatus` | string (o null): `PENDING`, `ACTIVE`, `ON_LEAVE`, `INACTIVE`, `GRADUATED`, `TRANSFERRED` | sí | Estado anterior de la membresía, si se conoce. |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "membership.activated.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "membership": {
      "membershipId": "cm1membershipanaperez000",
      "organizationId": "cm1clubsanlorenzo0000000",
      "personId": "cm1personanaperez0000000",
      "status": "ACTIVE",
      "joinedAt": "2026-10-02T21:15:04.000Z",
      "memberNumber": "1042",
      "person": {
        "id": "cm1personanaperez0000000",
        "displayName": "Ana Pérez",
        "firstName": "Ana",
        "lastName": "Pérez",
        "avatarUrl": null,
        "updatedAt": "2026-10-02T21:15:04.000Z"
      },
      "updatedAt": "2026-10-02T21:15:04.000Z"
    },
    "previousStatus": "PENDING"
  }
}
```

### `membership.ended.v1` — Socio dado de baja

Una membresía terminó: baja (INACTIVE), egreso (GRADUATED) o pase a otro club (TRANSFERRED). `reason` dice cuál.

- **Permiso que necesita la app:** `kernel.service.memberships.read` (Leer el padrón de socios)
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `membership` | objeto | sí | Igual que MemberView de la API de datos. |
| `membership.membershipId` | string | sí |  |
| `membership.organizationId` | string | sí |  |
| `membership.personId` | string | sí |  |
| `membership.status` | string: `PENDING`, `ACTIVE`, `ON_LEAVE`, `INACTIVE`, `GRADUATED`, `TRANSFERRED` | sí |  |
| `membership.joinedAt` | string (o null) (date-time) | no |  |
| `membership.memberNumber` | string (o null) | no |  |
| `membership.person` | objeto | sí | Igual que PersonView de la API de datos. email, phone y birthDate solo aparecen si la app tiene kernel.service.persons.contact.read. |
| `membership.person.id` | string | sí |  |
| `membership.person.displayName` | string | sí |  |
| `membership.person.firstName` | string | sí |  |
| `membership.person.lastName` | string | sí |  |
| `membership.person.avatarUrl` | string (o null) | no |  |
| `membership.person.email` | string (o null) | no |  |
| `membership.person.phone` | string (o null) | no |  |
| `membership.person.birthDate` | string (o null) (date) | no |  |
| `membership.person.updatedAt` | string (date-time) | sí |  |
| `membership.updatedAt` | string (date-time) | sí |  |
| `previousStatus` | string (o null): `PENDING`, `ACTIVE`, `ON_LEAVE`, `INACTIVE`, `GRADUATED`, `TRANSFERRED` | sí | Estado anterior de la membresía, si se conoce. |
| `reason` | string: `INACTIVE`, `GRADUATED`, `TRANSFERRED` | sí |  |
| `endedAt` | string (o null) (date-time) | no |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "membership.ended.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "membership": {
      "membershipId": "cm1membershipanaperez000",
      "organizationId": "cm1clubsanlorenzo0000000",
      "personId": "cm1personanaperez0000000",
      "status": "INACTIVE",
      "joinedAt": "2025-03-14T00:00:00.000Z",
      "memberNumber": "1042",
      "person": {
        "id": "cm1personanaperez0000000",
        "displayName": "Ana Pérez",
        "firstName": "Ana",
        "lastName": "Pérez",
        "avatarUrl": null,
        "updatedAt": "2026-10-02T21:15:04.000Z"
      },
      "updatedAt": "2026-10-02T21:15:04.000Z"
    },
    "previousStatus": "ACTIVE",
    "reason": "INACTIVE",
    "endedAt": "2026-10-02T21:15:04.000Z"
  }
}
```

### `appointment.activated.v1` — Cargo asumido

Una persona asumió un cargo (presidencia, secretaría, RDR...). Es el evento a usar en lugar de buscar cambios en las autoridades.

- **Permiso que necesita la app:** `kernel.service.authorities.read` (Leer autoridades vigentes)
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `authority` | objeto | sí | Igual que AuthorityView de la API de datos (sin contacto). |
| `authority.appointmentId` | string | sí |  |
| `authority.organizationId` | string | sí |  |
| `authority.periodId` | string | sí |  |
| `authority.positionCode` | string | sí |  |
| `authority.positionName` | string | sí |  |
| `authority.status` | string: `NOMINATED`, `ELECTED`, `ACTIVE`, `ENDED`, `REVOKED` | sí |  |
| `authority.startsAt` | string (o null) (date-time) | no |  |
| `authority.endsAt` | string (o null) (date-time) | no |  |
| `authority.person` | objeto | sí |  |
| `authority.person.id` | string | sí |  |
| `authority.person.displayName` | string | sí |  |
| `authority.person.avatarUrl` | string (o null) | no |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "appointment.activated.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "authority": {
      "appointmentId": "cm1appointmentanaperez00",
      "organizationId": "cm1clubsanlorenzo0000000",
      "periodId": "cm1period2026club0000000",
      "positionCode": "CLUB_PRESIDENT",
      "positionName": "Presidente/a",
      "status": "ACTIVE",
      "startsAt": "2026-07-01T00:00:00.000Z",
      "endsAt": "2027-06-30T00:00:00.000Z",
      "person": {
        "id": "cm1personanaperez0000000",
        "displayName": "Ana Pérez",
        "avatarUrl": null
      }
    }
  }
}
```

### `appointment.ended.v1` — Cargo terminado

Un cargo que estaba en ejercicio terminó: al cerrar el período, a mano, por la baja de la membresía que lo respaldaba (ENDED) o por revocación (REVOKED).

- **Permiso que necesita la app:** `kernel.service.authorities.read` (Leer autoridades vigentes)
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `authority` | objeto | sí | Igual que AuthorityView de la API de datos (sin contacto). |
| `authority.appointmentId` | string | sí |  |
| `authority.organizationId` | string | sí |  |
| `authority.periodId` | string | sí |  |
| `authority.positionCode` | string | sí |  |
| `authority.positionName` | string | sí |  |
| `authority.status` | string: `NOMINATED`, `ELECTED`, `ACTIVE`, `ENDED`, `REVOKED` | sí |  |
| `authority.startsAt` | string (o null) (date-time) | no |  |
| `authority.endsAt` | string (o null) (date-time) | no |  |
| `authority.person` | objeto | sí |  |
| `authority.person.id` | string | sí |  |
| `authority.person.displayName` | string | sí |  |
| `authority.person.avatarUrl` | string (o null) | no |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "appointment.ended.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "authority": {
      "appointmentId": "cm1appointmentanaperez00",
      "organizationId": "cm1clubsanlorenzo0000000",
      "periodId": "cm1period2026club0000000",
      "positionCode": "CLUB_PRESIDENT",
      "positionName": "Presidente/a",
      "status": "ENDED",
      "startsAt": "2026-07-01T00:00:00.000Z",
      "endsAt": "2027-06-30T00:00:00.000Z",
      "person": {
        "id": "cm1personanaperez0000000",
        "displayName": "Ana Pérez",
        "avatarUrl": null
      }
    }
  }
}
```

### `organization.updated.v1` — Club o distrito actualizado

Cambiaron los datos de un club o del distrito (nombre, ciudad, logo...), o su estado (activo/inactivo) o su ubicación en el árbol.

- **Permiso que necesita la app:** `kernel.service.organizations.read` (Leer clubes y distrito)
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `organization` | objeto | sí | Igual que OrganizationView de la API de datos. |
| `organization.id` | string | sí |  |
| `organization.type` | string: `DISTRICT`, `CLUB`, `OTHER` | sí |  |
| `organization.code` | string | sí |  |
| `organization.name` | string | sí |  |
| `organization.slug` | string | sí |  |
| `organization.status` | string: `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED` | sí |  |
| `organization.parentId` | string (o null) | no |  |
| `organization.countryCode` | string (o null) | no |  |
| `organization.region` | string (o null) | no |  |
| `organization.city` | string (o null) | no |  |
| `organization.timezone` | string (o null) | no |  |
| `organization.logoUrl` | string (o null) | no |  |
| `organization.description` | string (o null) | no |  |
| `organization.updatedAt` | string (date-time) | sí |  |
| `changedFields` | array | sí | Nombres de los campos que cambiaron (no sus valores anteriores). Puede venir vacío en eventos registrados antes de que el kernel los informara. |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "organization.updated.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "organization": {
      "id": "cm1clubsanlorenzo0000000",
      "type": "CLUB",
      "code": "RC-SANLORENZO",
      "name": "Rotaract Club San Lorenzo",
      "slug": "rc-san-lorenzo",
      "status": "ACTIVE",
      "parentId": "cm1district48450000000000",
      "countryCode": "PY",
      "region": "Central",
      "city": "San Lorenzo",
      "timezone": "America/Asuncion",
      "logoUrl": null,
      "description": null,
      "updatedAt": "2026-10-02T21:15:04.000Z"
    },
    "changedFields": [
      "name",
      "city"
    ]
  }
}
```

### `organization.archived.v1` — Club archivado

Un club (o distrito) se archivó: dejó de existir y no admite cambios. Es definitivo.

- **Permiso que necesita la app:** `kernel.service.organizations.read` (Leer clubes y distrito)
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `organization` | objeto | sí | Igual que OrganizationView de la API de datos. |
| `organization.id` | string | sí |  |
| `organization.type` | string: `DISTRICT`, `CLUB`, `OTHER` | sí |  |
| `organization.code` | string | sí |  |
| `organization.name` | string | sí |  |
| `organization.slug` | string | sí |  |
| `organization.status` | string: `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED` | sí |  |
| `organization.parentId` | string (o null) | no |  |
| `organization.countryCode` | string (o null) | no |  |
| `organization.region` | string (o null) | no |  |
| `organization.city` | string (o null) | no |  |
| `organization.timezone` | string (o null) | no |  |
| `organization.logoUrl` | string (o null) | no |  |
| `organization.description` | string (o null) | no |  |
| `organization.updatedAt` | string (date-time) | sí |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "organization.archived.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "organization": {
      "id": "cm1clubsanlorenzo0000000",
      "type": "CLUB",
      "code": "RC-SANLORENZO",
      "name": "Rotaract Club San Lorenzo",
      "slug": "rc-san-lorenzo",
      "status": "ARCHIVED",
      "parentId": "cm1district48450000000000",
      "countryCode": "PY",
      "region": "Central",
      "city": "San Lorenzo",
      "timezone": "America/Asuncion",
      "logoUrl": null,
      "description": null,
      "updatedAt": "2026-10-02T21:15:04.000Z"
    }
  }
}
```

### `person.updated.v1` — Datos de una persona actualizados

Cambiaron los datos de una persona con membresía en el alcance de la app. Los cambios de email, teléfono o fecha de nacimiento solo se informan a apps con kernel.service.persons.contact.read.

- **Permiso que necesita la app:** `kernel.service.persons.read` (Leer datos de personas)
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `person` | objeto | sí | Igual que PersonView de la API de datos. email, phone y birthDate solo aparecen si la app tiene kernel.service.persons.contact.read. |
| `person.id` | string | sí |  |
| `person.displayName` | string | sí |  |
| `person.firstName` | string | sí |  |
| `person.lastName` | string | sí |  |
| `person.avatarUrl` | string (o null) | no |  |
| `person.email` | string (o null) | no |  |
| `person.phone` | string (o null) | no |  |
| `person.birthDate` | string (o null) (date) | no |  |
| `person.updatedAt` | string (date-time) | sí |  |
| `changedFields` | array | sí | Nombres de los campos que cambiaron (no sus valores anteriores). Puede venir vacío en eventos registrados antes de que el kernel los informara. |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "person.updated.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "person": {
      "id": "cm1personanaperez0000000",
      "displayName": "Ana Pérez",
      "firstName": "Ana",
      "lastName": "Pérez",
      "avatarUrl": null,
      "updatedAt": "2026-10-02T21:15:04.000Z"
    },
    "changedFields": [
      "lastName"
    ]
  }
}
```

### `period.created.v1` — Período creado

Se creó un período institucional (por ejemplo, 2026-2027).

- **Permiso que necesita la app:** `kernel.service.periods.read` (Leer períodos)
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `period` | objeto | sí | Igual que PeriodView de la API de datos. |
| `period.id` | string | sí |  |
| `period.organizationId` | string | sí |  |
| `period.code` | string | sí |  |
| `period.name` | string | sí |  |
| `period.status` | string: `DRAFT`, `SCHEDULED`, `ACTIVE`, `CLOSED`, `CANCELLED` | sí |  |
| `period.startDate` | string (date-time) | sí |  |
| `period.endDate` | string (date-time) | sí |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "period.created.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "period": {
      "id": "cm1period2027club0000000",
      "organizationId": "cm1clubsanlorenzo0000000",
      "code": "2027-2028",
      "name": "Período 2027-2028",
      "status": "DRAFT",
      "startDate": "2027-07-01T00:00:00.000Z",
      "endDate": "2028-06-30T00:00:00.000Z"
    }
  }
}
```

### `module.installed.v1` — Módulo instalado

Un club (o el distrito) instaló tu módulo. Todavía está pendiente: se usa recién cuando llega module.enabled.v1. Solo llega a la app dueña del módulo (la que lo registró).

- **Permiso que necesita la app:** ninguno
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `installation` | objeto | sí | La instalación de tu módulo en una organización, con su configuración actual. |
| `installation.moduleId` | string | sí |  |
| `installation.organizationId` | string | sí |  |
| `installation.status` | string: `PENDING`, `ACTIVE`, `SUSPENDED`, `DISABLED` | sí |  |
| `installation.configuration` | object (o null) | sí | Configuración del club, ya validada contra el configurationSchema del módulo. |
| `installation.installedAt` | string (date-time) | sí |  |
| `installation.activatedAt` | string (o null) (date-time) | no |  |
| `installation.disabledAt` | string (o null) (date-time) | no |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "module.installed.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "installation": {
      "moduleId": "reuniones",
      "organizationId": "cm1clubsanlorenzo0000000",
      "status": "PENDING",
      "configuration": {
        "emailContacto": "rc.sanlorenzo@example.org",
        "votosPorClub": 1,
        "avisarPorEmail": true,
        "idioma": "es"
      },
      "installedAt": "2026-10-02T21:10:00.000Z",
      "activatedAt": null,
      "disabledAt": null
    }
  }
}
```

### `module.enabled.v1` — Módulo activado

Tu módulo quedó activo en un club (o en el distrito): desde ahora sus permisos valen ahí. Solo llega a la app dueña del módulo (la que lo registró).

- **Permiso que necesita la app:** ninguno
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `installation` | objeto | sí | La instalación de tu módulo en una organización, con su configuración actual. |
| `installation.moduleId` | string | sí |  |
| `installation.organizationId` | string | sí |  |
| `installation.status` | string: `PENDING`, `ACTIVE`, `SUSPENDED`, `DISABLED` | sí |  |
| `installation.configuration` | object (o null) | sí | Configuración del club, ya validada contra el configurationSchema del módulo. |
| `installation.installedAt` | string (date-time) | sí |  |
| `installation.activatedAt` | string (o null) (date-time) | no |  |
| `installation.disabledAt` | string (o null) (date-time) | no |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "module.enabled.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "installation": {
      "moduleId": "reuniones",
      "organizationId": "cm1clubsanlorenzo0000000",
      "status": "ACTIVE",
      "configuration": {
        "emailContacto": "rc.sanlorenzo@example.org",
        "votosPorClub": 1,
        "avisarPorEmail": true,
        "idioma": "es"
      },
      "installedAt": "2026-10-02T21:10:00.000Z",
      "activatedAt": "2026-10-02T21:15:04.000Z",
      "disabledAt": null
    }
  }
}
```

### `module.disabled.v1` — Módulo desactivado

Un club desactivó (SUSPENDED, se puede volver a activar) o desinstaló (DISABLED) tu módulo. Sus permisos dejan de valer ahí; los datos que guarda tu app no se borran. Solo llega a la app dueña del módulo (la que lo registró).

- **Permiso que necesita la app:** ninguno
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `installation` | objeto | sí | La instalación de tu módulo en una organización, con su configuración actual. |
| `installation.moduleId` | string | sí |  |
| `installation.organizationId` | string | sí |  |
| `installation.status` | string: `PENDING`, `ACTIVE`, `SUSPENDED`, `DISABLED` | sí |  |
| `installation.configuration` | object (o null) | sí | Configuración del club, ya validada contra el configurationSchema del módulo. |
| `installation.installedAt` | string (date-time) | sí |  |
| `installation.activatedAt` | string (o null) (date-time) | no |  |
| `installation.disabledAt` | string (o null) (date-time) | no |  |
| `reason` | string: `SUSPENDED`, `DISABLED` | sí |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "module.disabled.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "installation": {
      "moduleId": "reuniones",
      "organizationId": "cm1clubsanlorenzo0000000",
      "status": "SUSPENDED",
      "configuration": {
        "emailContacto": "rc.sanlorenzo@example.org",
        "votosPorClub": 1,
        "avisarPorEmail": true,
        "idioma": "es"
      },
      "installedAt": "2026-10-02T21:10:00.000Z",
      "activatedAt": "2026-10-02T21:15:04.000Z",
      "disabledAt": null
    },
    "reason": "SUSPENDED"
  }
}
```

### `module.configured.v1` — Configuración del módulo actualizada

Un club cambió la configuración de tu módulo. `installation.configuration` trae la configuración nueva completa. Solo llega a la app dueña del módulo (la que lo registró).

- **Permiso que necesita la app:** ninguno
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `installation` | objeto | sí | La instalación de tu módulo en una organización, con su configuración actual. |
| `installation.moduleId` | string | sí |  |
| `installation.organizationId` | string | sí |  |
| `installation.status` | string: `PENDING`, `ACTIVE`, `SUSPENDED`, `DISABLED` | sí |  |
| `installation.configuration` | object (o null) | sí | Configuración del club, ya validada contra el configurationSchema del módulo. |
| `installation.installedAt` | string (date-time) | sí |  |
| `installation.activatedAt` | string (o null) (date-time) | no |  |
| `installation.disabledAt` | string (o null) (date-time) | no |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "module.configured.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "installation": {
      "moduleId": "reuniones",
      "organizationId": "cm1clubsanlorenzo0000000",
      "status": "ACTIVE",
      "configuration": {
        "emailContacto": "rc.sanlorenzo@example.org",
        "votosPorClub": 1,
        "avisarPorEmail": true,
        "idioma": "es"
      },
      "installedAt": "2026-10-02T21:10:00.000Z",
      "activatedAt": "2026-10-02T21:15:04.000Z",
      "disabledAt": null
    }
  }
}
```

### `ping.v1` — Prueba

Evento de prueba que se manda desde la consola ("Enviar prueba"). No hace falta suscribirse: llega a cualquier endpoint.

- **Permiso que necesita la app:** ninguno
- **Versión:** 1

Campos de `data`:

| Campo | Tipo | Siempre presente | Notas |
|---|---|---|---|
| `message` | string | sí |  |
| `appId` | string | sí |  |
| `endpointId` | string | sí |  |

Ejemplo del cuerpo que recibís:

```json
{
  "id": "evt_cm1exampleevent000000000",
  "type": "ping.v1",
  "createdAt": "2026-10-02T21:15:04.000Z",
  "organizationId": "cm1clubsanlorenzo0000000",
  "data": {
    "message": "Hola desde Mi Rotaract",
    "appId": "cm1appasistencia00000000",
    "endpointId": "cm1webhookendpoint000000"
  }
}
```
