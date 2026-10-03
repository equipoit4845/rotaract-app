/**
 * Copy of packages/module-manifest/schema/module-manifest.v1.json (the
 * source of truth). The kernel image does not include workspace packages,
 * so the schema is vendored here; manifest.spec.ts fails if the two differ.
 * Regenerate: see docs/15-modules.md (“Esquema vendorizado”).
 */
/* eslint-disable */
export const MODULE_MANIFEST_SCHEMA: Record<string, unknown> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://developers.rotaract4845.com/schemas/module-manifest.v1.json",
  title: "Manifiesto de módulo de Mi Rotaract (v1)",
  description:
    "Describe un módulo que los clubes pueden instalar: sus permisos propios, los eventos que usa, su configuración por club y cómo se abre desde Mi Rotaract. El archivo se llama mirotaract.module.json.",
  type: "object",
  additionalProperties: false,
  required: ["id", "name", "version", "contractVersion", "permissions"],
  properties: {
    $schema: {
      type: "string",
      description: "URL de este esquema, para que el editor autocomplete.",
    },
    id: {
      title: "Identificador",
      description:
        "Identificador estable del módulo y prefijo de sus permisos. Minúsculas, números y guiones; no cambia nunca.",
      type: "string",
      minLength: 3,
      maxLength: 40,
      pattern: "^[a-z][a-z0-9-]*[a-z0-9]$",
      not: {
        enum: [
          "kernel",
          "mirotaract",
          "service",
          "oauth",
          "openid",
          "platform",
          "system",
        ],
      },
    },
    name: {
      title: "Nombre",
      description: "Nombre visible en el catálogo de módulos.",
      type: "string",
      minLength: 2,
      maxLength: 60,
    },
    description: {
      title: "Descripción",
      description: "Qué resuelve el módulo, en una o dos oraciones.",
      type: "string",
      maxLength: 500,
    },
    version: {
      title: "Versión",
      description: "Versión semántica (1.2.3).",
      type: "string",
      pattern:
        "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
    },
    contractVersion: {
      title: "Versión del contrato",
      description: "Versión de este formato de manifiesto. Siempre 1.",
      const: 1,
    },
    permissions: {
      title: "Permisos",
      description:
        "Permisos propios del módulo. Cada código empieza con el id del módulo y un punto. El RDR los asigna a cargos.",
      type: "array",
      maxItems: 100,
      items: {
        $ref: "#/definitions/permission",
      },
    },
    events: {
      title: "Eventos",
      type: "object",
      additionalProperties: false,
      properties: {
        subscribes: {
          title: "Eventos que recibe",
          description:
            "Tipos del catálogo público de eventos de Mi Rotaract que el módulo escucha (por ejemplo membership.activated.v1).",
          type: "array",
          uniqueItems: true,
          items: {
            $ref: "#/definitions/eventType",
          },
        },
        emits: {
          title: "Eventos que publica",
          description:
            "Eventos propios del módulo. Empiezan con el id del módulo.",
          type: "array",
          uniqueItems: true,
          items: {
            $ref: "#/definitions/eventType",
          },
        },
      },
    },
    configurationSchema: {
      title: "Esquema de configuración",
      description:
        "JSON Schema (draft-07) de la configuración que cada club completa al instalar el módulo. La raíz es un objeto. Usá title y description en español: con eso se arma el formulario.",
      type: "object",
    },
    ui: {
      title: "Interfaz",
      type: "object",
      additionalProperties: false,
      required: ["entryUrl"],
      properties: {
        entryUrl: {
          title: "Dirección de entrada",
          description:
            "URL donde se abre el módulo. https, salvo localhost en desarrollo.",
          type: "string",
          format: "uri",
          pattern: "^https?://",
        },
        navLabel: {
          title: "Texto en el menú",
          type: "string",
          minLength: 2,
          maxLength: 30,
        },
        icon: {
          title: "Ícono",
          description:
            "Nombre de un ícono de lucide (https://lucide.dev), por ejemplo calendar-check.",
          type: "string",
          pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
          maxLength: 40,
        },
      },
    },
    oauth: {
      title: "Ingreso",
      type: "object",
      additionalProperties: false,
      properties: {
        clientId: {
          title: "clientId de la app",
          description:
            "clientId de la app registrada en Mi Rotaract dueña del módulo. Si está, tiene que coincidir con la app con la que se registra.",
          type: "string",
          minLength: 1,
        },
        scopes: {
          title: "Scopes",
          description:
            "Scopes que pide la app (openid, profile, kernel.service.*...).",
          type: "array",
          uniqueItems: true,
          items: {
            type: "string",
            pattern: "^[a-z][a-z0-9_.:-]*$",
          },
        },
      },
    },
    capabilities: {
      title: "Capacidades",
      description:
        "Etiquetas libres que el módulo ofrece a otros (por ejemplo meetings.voting). Opcional.",
      type: "array",
      uniqueItems: true,
      items: {
        type: "string",
        pattern: "^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)*$",
      },
    },
  },
  definitions: {
    permission: {
      type: "object",
      additionalProperties: false,
      required: ["code", "name"],
      properties: {
        code: {
          title: "Código",
          description:
            "<idDelMódulo>.<recurso>.<acción>, por ejemplo reuniones.meeting.manage.",
          type: "string",
          maxLength: 120,
          pattern: "^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*){2,}$",
        },
        name: {
          title: "Nombre",
          description:
            "Qué permite, en lenguaje simple. Es lo que ve el RDR en la pantalla de cargos.",
          type: "string",
          minLength: 3,
          maxLength: 120,
        },
        description: {
          title: "Descripción",
          type: "string",
          maxLength: 500,
        },
        scopeType: {
          title: "Alcance",
          description:
            "ORGANIZATION: vale en el club donde la persona tiene el cargo. ORGANIZATION_TREE: vale también en los clubes que dependen de esa organización (cargos de distrito).",
          enum: ["ORGANIZATION", "ORGANIZATION_TREE"],
          default: "ORGANIZATION",
        },
      },
    },
    eventType: {
      type: "string",
      maxLength: 120,
      pattern: "^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)+\\.v[1-9][0-9]*$",
    },
  },
};
