# Gobierno institucional — Institutional Kernel v1.1

**Estado:** extensión normativa de `kernel-spec.md`. Define las capacidades
institucionales que no pertenecen a Meetings, Events ni otros consumidores.
Ante conflicto, prevalece este documento en materia de políticas, gobierno,
suplencias, incompatibilidades y correcciones históricas.

## 1. Decisiones de compatibilidad

La jerarquía de políticas es `PLATFORM → DISTRICT → CLUB`. La plataforma fija
seguridad, trazabilidad, estados, mínimos de retención y el ciclo rotario
institucional. En Kernel v1 el período rotario es invariable: inicia el 1 de
julio y termina el 30 de junio siguiente. El distrito configura el calendario
electoral y los hitos dentro de ese período; no puede alterar sus límites.

Una política se resuelve en este orden: valor vigente de club, valor vigente
del distrito y valor predeterminado de plataforma. Sólo un valor marcado como
`overridable` por su origen puede ser reemplazado por el siguiente nivel.
Una versión nunca se actualiza in situ.

## 2. Modelo de políticas

```text
InstitutionalPolicy
  id, policyKey, value, scopeType, scopeId
  inheritable, overridable, effectiveFrom, effectiveUntil, version
  supersedesPolicyId, createdById, createdAt
```

Las claves iniciales incluyen tipos de membresía, calendario electoral,
requisitos de cargos, catálogo delegable de cargos, representación,
documentación obligatoria, privacidad, regularidad de clubes y retención.
El kernel conserva todas las versiones y registra la política efectiva usada
en cada decisión sensible.

## 3. Titularidad, delegación y suplencia

`Appointment` identifica al titular. `Delegation` identifica quién ejerce,
por cuánto tiempo y bajo qué facultades; nunca reemplaza ni elimina el
nombramiento titular.

```text
Delegation
  id, appointmentId, delegatePersonId, delegateMembershipId
  scopeType, organizationId, delegatedCapabilities, kind
  reason, evidenceReference, startsAt, endsAt
  approvedById, status, createdAt, endedAt, revokedAt
```

Estados: `DRAFT → APPROVED → ACTIVE → ENDED`, con `REVOKED` como salida
terminal desde `APPROVED` o `ACTIVE`. `kind` es `TOTAL`, `PARTIAL`,
`TEMPORARY` o `VACANCY`. Firma, voto y administración financiera se deniegan
por defecto y sólo se ejercen si figuran expresamente en
`delegatedCapabilities`.

La auditoría de una acción registra tanto `appointmentId` titular como la
delegación efectiva, cuando exista.

## 4. Incompatibilidades y excepciones

```text
PositionCompatibilityRule
  id, ownerOrganizationId, leftPositionId, rightPositionId
  relationScope, overlapRequired, maxSimultaneous, exceptionAllowed
  effectiveFrom, effectiveUntil, status

PositionCompatibilityException
  id, ruleId, personId, appointmentId, reason, evidenceReference
  approvedById, approvedAt, validUntil, revokedAt
```

Las reglas pueden prohibir pares de cargos, limitar cantidades simultáneas y
aplicar dentro de club, distrito o entre ambos. Antes de activar un
`Appointment`, el kernel evalúa reglas vigentes sobre períodos y fechas
solapadas. Una excepción sólo habilita el caso concreto, requiere motivo,
evidencia, aprobación y auditoría. Nadie puede ser titular y suplente del
mismo cargo en el mismo intervalo.

## 5. Catálogo, capacidades y autoridad efectiva

Las definiciones de cargo tienen nivel `PLATFORM_POSITION`,
`DISTRICT_POSITION` o `CLUB_POSITION`, propietario y versión. Un cargo usado
no cambia de código ni significado: se crea una versión nueva. Estados:
`DRAFT`, `ACTIVE`, `DEPRECATED`, `RETIRED`; los dos últimos preservan el
historial y bloquean nuevos nombramientos según su regla.

Cada cargo declara capacidades institucionales, no inferidas de su nombre:

```text
CAN_REPRESENT_ORGANIZATION
CAN_CAST_VOTE
CAN_SIGN_DOCUMENTS
CAN_CERTIFY_RECORDS
CAN_MANAGE_MEMBERS
CAN_MANAGE_FINANCES
CAN_DELEGATE
```

Una capacidad puede restringirse por organización, período, tipo de reunión
o documento, firma conjunta, límite monetario, prioridad y delegabilidad.
La decisión efectiva evalúa persona, nombramiento activo, capacidad, alcance,
período, membresía, estado del club y delegación vigente. Meetings conserva
un snapshot sellado de elegibilidad para que cambios posteriores no alteren
un voto ya emitido.

Un socio puede mantener un cargo de club y un cargo distrital, además de una
designación futura. Sólo una incompatibilidad explícita puede impedirlo.

## 6. Elección, sucesión y renuncia

El kernel registra el proceso institucional; Meetings implementa la
interacción de voto. `ElectionProcess` sigue:

```text
DRAFT → NOMINATIONS_OPEN → NOMINATIONS_CLOSED → CANDIDATES_CONFIRMED
→ VOTING_OPEN → VOTING_CLOSED → PROVISIONAL_RESULT → CHALLENGE_PERIOD
→ CONFIRMED → TRANSITION → COMPLETED
```

Puede pasar a `CANCELLED`, `SUSPENDED` o `ANNULLED` conforme a la política.
Las candidaturas validan elegibilidad e incompatibilidades. Una impugnación
no borra el resultado; suspende la confirmación hasta su resolución.

La renuncia termina anticipadamente el nombramiento, guarda motivo y
evidencia, revoca los roles derivados y crea el flujo de suplencia o sucesión
que corresponda. `ELECTED`, `IN_TRANSITION` y `ACTIVE` pueden coexistir, pero
sólo `ACTIVE` concede facultades ejecutivas salvo capacidad transicional
explícita.

## 7. Membresías, clubes y períodos

El tipo de vínculo y el estado son dimensiones independientes. Tipos iniciales:
`ACTIVE_MEMBER`, `HONORARY_MEMBER`, `PROSPECTIVE_MEMBER`, `ALUMNI` y
`TRANSFER_PENDING`. Los estados institucionales objetivo son `PENDING`,
`ACTIVE`, `ON_LEAVE`, `SUSPENDED`, `ENDED`, `TRANSFERRED`, `REJECTED` y
`CANCELLED`.

La migración conserva la semántica actual: `INACTIVE`/`GRADUATED` se mapean a
`ENDED` con causa; las nuevas columnas `membershipType` y `endReason` se
introducen sin perder transiciones existentes. La transferencia sigue siendo
atómica. Licencia o suspensión pueden limitar voto, representación o
elegibilidad según política, sin borrar la membresía.

Los estados objetivo de club son `PENDING`, `ACTIVE`, `INACTIVE`,
`SUSPENDED`, `INTERVENED` y `ARCHIVED`. `SUSPENDED` bloquea representación,
voto y cambios sensibles; `INTERVENED` registra interventores y capacidades
explícitas. Cada transición exige resolución, motivo, responsable, fecha
efectiva y auditoría. La migración de `DRAFT` a `PENDING` se hará con una
versión mayor de API para no romper clientes v1.

Los clubes operan por defecto dentro del período de su distrito. Sus ciclos
operativos pueden diferir; una excepción institucional requiere club,
período distrital de referencia, fechas, motivo, aprobador y efectos.

## 8. Datos, privacidad y retención

Los datos se clasifican como `PUBLIC`, `INSTITUTIONAL`, `CONFIDENTIAL`,
`SENSITIVE` o `RESTRICTED`. Los campos verificables guardan
`verificationStatus`, `verificationSource`, `verifiedAt` y `verifiedBy`.
Distrito y club acceden por necesidad institucional; un administrador técnico
no adquiere acceso funcional automático a PII.

Las políticas de retención son versionadas por categoría y no pueden reducir
el mínimo de plataforma/normativa. Las bajas preservan identificador, vínculo,
fechas, cargos y actos institucionales. Al vencer la necesidad identificable,
se anonimizan o seudonimizan datos de contacto, documento, domicilio,
archivos personales y contactos de emergencia, salvo retención legal.

## 9. Correcciones históricas

Los formularios ordinarios no modifican historia institucional. Toda corrección
usa:

```text
CorrectionRequest
  id, entityType, entityId, currentValue, requestedValue
  reason, evidenceReference, requestedById, approvedById
  effectiveAt, impactAssessment, status
```

Estados: `REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `APPLIED` y
`REVERTED`. Las sensibles requieren doble aprobación. El análisis de impacto
es obligatorio si afecta permisos, representación, voto, quórum o documentos.
Se mantienen versión anterior, nueva, actores, evidencia, fecha y eventos.

Permisos reservados: `kernel.history.correct`, `kernel.membership.override`,
`kernel.appointment.override`, `kernel.period.override` y
`kernel.organization.status.override`.

## 10. Contrato de implementación

La siguiente versión contractual incorpora, en este orden: políticas y su
resolver; capacidades de cargo; delegaciones e incompatibilidades; procesos
electorales; tipos de membresía y estados ampliados de club; correcciones
históricas y privacidad. Cada agregado tendrá API, eventos Outbox, auditoría,
idempotencia, máquina de estados y pruebas de concurrencia antes de exponerse
a consumidores.
