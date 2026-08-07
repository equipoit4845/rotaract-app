# API y SDK

## Contrato HTTP

La especificación canónica es [`kernel-openapi.yaml`](../kernel-openapi.yaml).
El validador del repositorio reconoce 117 operaciones OpenAPI. Los controllers
se agrupan en los siguientes dominios:

| Controller                | Cobertura                                                                |
| ------------------------- | ------------------------------------------------------------------------ |
| `AuthController`          | Registro, login, refresh, sesiones, recuperación, invitaciones y cuentas |
| `OrganizationsController` | Organizaciones y jerarquía                                               |
| `InstitutionalController` | Personas, membresías, períodos, cargos y nombramientos                   |
| `AuthorizationController` | Permisos, roles y decisiones                                             |
| `WorkflowController`      | Solicitudes, transferencias y módulos                                    |
| `ServiceController`       | Lecturas de SDK para otros servicios                                     |

Las mutaciones protegidas requieren `Idempotency-Key` cuando la operación lo
declara. Los errores se devuelven mediante Problem Details.

## Autenticación

Las rutas públicas incluyen registro, login, refresh, verificación y
recuperación. El access token dura diez minutos y el refresh token se rota con
vigencia de treinta días. Las sesiones pueden revocarse de forma individual o
global.

El login aplica bloqueo temporal tras intentos fallidos. Las cuentas migradas
con bcrypt pasan a Argon2id tras autenticarse correctamente.

Las rutas `/service/*` usan autenticación de servicio. El token debe tener la
audiencia `institutional-kernel`; `KERNEL_SERVICE_API_KEY` se mantiene como
compatibilidad de desarrollo.

## SDK

`packages/kernel-sdk` expone `KernelClient`. El `baseUrl` debe incluir el
prefijo versionado, por ejemplo:

```ts
import { KernelClient } from "@mirotaract/kernel-sdk";

const kernel = new KernelClient({
  baseUrl: "http://localhost:3001/api/kernel/v1",
  serviceToken: process.env.KERNEL_SERVICE_TOKEN,
});
```

Métodos disponibles:

- `version()` e `introspect()`;
- `getUserContext()`, `getPerson()` y `getOrganization()`;
- snapshots de membresías, autoridades y período;
- `checkAuthorization()` y `batchCheckAuthorization()`;
- `getModuleInstallation()`.

Los tipos retornados proceden de `@mirotaract/kernel-contracts` y el contrato
SDK documentado. El paquete se construye como artefacto ESM con declaraciones
en `dist/`; `pnpm test:live` lo carga desde ese artefacto y prueba las llamadas
contra una API Nest real con un JWT de servicio de alcance mínimo.

## Validación OpenAPI en runtime

`KERNEL_OPENAPI_RUNTIME_VALIDATION=true` valida request body, parámetros de
ruta y query antes de llegar al controller. Una infracción devuelve Problem
Details 400. Con `KERNEL_OPENAPI_RESPONSE_VALIDATION=true`, además se valida la
representación JSON de cada respuesta exitosa y una divergencia se trata como 500. La ruta del contrato se descubre automáticamente desde el repositorio o
puede fijarse mediante `KERNEL_OPENAPI_PATH`.

## Eventos

`kernel-events-contract.md` define los 52 tipos de eventos. El envelope de
salida incluye versión, evento, agregado y versión, actor, timestamps,
correlación, causación, traza y payload. El evento se publica desde Outbox, no
desde el controller HTTP.
