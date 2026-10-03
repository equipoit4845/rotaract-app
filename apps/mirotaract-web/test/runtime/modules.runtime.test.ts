// bootstrap.ts installs jsdom's globals and must run before
// `@testing-library/react`/react-dom ever get imported.
import "./bootstrap.ts";

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { cleanup, fireEvent } from "@testing-library/react";
import React from "react";

import { MockBackend } from "./mock-backend.ts";
import {
  jsonResponse,
  problemResponse,
  renderWithClient,
  waitFor,
} from "./render.ts";

afterEach(cleanup);

const { tokenManager } =
  await import("../../src/lib/api/client/token-manager.ts");
const { ActiveOrganizationProvider } =
  await import("../../src/features/shell/active-organization-context.tsx");
const { ModulesContainer } =
  await import("../../src/features/modules/containers/modules-container.tsx");
const { PositionPermissionsPanel, groupByModule } =
  await import("../../src/features/positions/components/position-permissions-panel.tsx");
const schemaForm =
  await import("../../src/features/modules/utils/schema-form.ts");

const CLUB = {
  id: "org_club",
  parentId: "org_district",
  type: "CLUB",
  code: "RC-SL",
  name: "Rotaract Club San Lorenzo",
  slug: "rc-san-lorenzo",
  status: "ACTIVE",
  timezone: "America/Asuncion",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};
const DISTRICT = {
  ...CLUB,
  id: "org_district",
  parentId: null,
  type: "DISTRICT",
  code: "D4845",
  name: "Distrito 4845",
  slug: "d4845",
};

const CONFIGURATION_SCHEMA = {
  type: "object",
  required: ["emailContacto"],
  properties: {
    emailContacto: {
      type: "string",
      format: "email",
      title: "Email de contacto del club",
    },
    votosPorClub: {
      type: "integer",
      title: "Votos por club",
      minimum: 1,
      maximum: 2,
      default: 1,
    },
    avisarPorEmail: {
      type: "boolean",
      title: "Avisar por email",
      default: true,
    },
    idioma: { type: "string", title: "Idioma", enum: ["es", "pt"] },
  },
};

const permission = (code: string, name: string, moduleId: string | null) => ({
  id: `perm_${code}`,
  code,
  namespace: moduleId ?? "kernel",
  name,
  description: null,
  resourceType: null,
  moduleId,
  isSystem: !moduleId,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const MODULE = {
  id: "reuniones",
  name: "Reuniones distritales",
  description: "Asambleas con quórum y votaciones por club.",
  version: "1.0.0",
  contractVersion: 1,
  status: "ACTIVE",
  manifest: {
    ui: { entryUrl: "https://reuniones.rotaract4845.com" },
  },
  configurationSchema: CONFIGURATION_SCHEMA,
  developerAppId: "app_1",
  ownerOrganizationId: DISTRICT.id,
  permissions: [
    permission("reuniones.vote.cast", "Votar en nombre del club", "reuniones"),
    permission(
      "reuniones.meeting.manage",
      "Crear y conducir reuniones distritales",
      "reuniones",
    ),
  ],
  registeredAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function installation(status: string, configuration: unknown = null) {
  return {
    id: "inst_1",
    moduleId: MODULE.id,
    organizationId: CLUB.id,
    status,
    configuration,
    installedById: "acc_1",
    installedAt: "2026-10-02T00:00:00.000Z",
    activatedAt: status === "ACTIVE" ? "2026-10-02T00:00:00.000Z" : null,
    disabledAt: null,
    updatedAt: "2026-10-02T00:00:00.000Z",
  };
}

function me() {
  return jsonResponse({
    accountId: "acc_1",
    personId: "per_1",
    accountStatus: "ACTIVE",
    platformRole: "USER",
    displayName: "Ana",
    memberships: [],
    contextVersion: 1,
  });
}

function backendWith(
  permissions: string[],
  handler: (
    request: Request,
    url: URL,
  ) => Promise<Response | undefined> | Response | undefined,
) {
  const backend = new MockBackend();
  backend.kernelHandler = async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/auth/me")) return me();
    if (url.pathname.includes("/effective-permissions"))
      return jsonResponse(permissions);
    return (await handler(request, url)) ?? problemResponse(404, "NOT_FOUND");
  };
  tokenManager.setSession(backend.issueToken(), 600);
  return backend;
}

type Organization = Omit<typeof CLUB, "parentId"> & { parentId: string | null };
function renderModules(organization: Organization) {
  return renderWithClient(
    React.createElement(ActiveOrganizationProvider, {
      value: {
        organizationId: organization.id,
        organization: organization as never,
        isLoading: false,
        availableMemberships: [],
        availableWorkspaces: [],
        setActiveOrganizationId: () => {},
      } as never,
      children: React.createElement(ModulesContainer),
    }),
  );
}

const PRESIDENT = [
  "kernel.module.read",
  "kernel.module.install",
  "kernel.module.configure",
  "kernel.module.disable",
];

test("Módulos — a president installs a module with its generated configuration form", async () => {
  let installed = false;
  let installBody: Record<string, unknown> | undefined;
  let activated = false;
  const backend = backendWith(PRESIDENT, async (request, url) => {
    if (
      url.pathname.endsWith("/modules") &&
      request.method === "GET" &&
      !url.pathname.includes("/organizations/")
    )
      return jsonResponse([MODULE]);
    if (url.pathname.endsWith(`/organizations/${CLUB.id}/modules`))
      return jsonResponse(
        installed ? [installation(activated ? "ACTIVE" : "PENDING")] : [],
      );
    if (url.pathname.endsWith("/install") && request.method === "POST") {
      installBody = (await request.json()) as Record<string, unknown>;
      const configuration = installBody.configuration as Record<
        string,
        unknown
      >;
      if (configuration.emailContacto === "no-es-email")
        return jsonResponse(
          {
            type: "about:blank",
            title: "Request failed",
            status: 422,
            code: "KERNEL_MODULE_CONFIGURATION_INVALID",
            detail: "La configuración no es válida.",
            instance: url.pathname,
            errors: [
              {
                path: "emailContacto",
                message:
                  "«Email de contacto del club» tiene que ser un email válido.",
              },
            ],
          },
          422,
        );
      installed = true;
      return jsonResponse(installation("PENDING", configuration), 201);
    }
    if (url.pathname.endsWith("/activate") && request.method === "POST") {
      activated = true;
      return jsonResponse(installation("ACTIVE"));
    }
    return undefined;
  });

  const { getByText, getByRole, getByLabelText, findByText, queryByText } =
    renderModules(CLUB);
  await waitFor(() => assert.ok(getByText("Reuniones distritales")));
  assert.ok(getByText("No instalado"));
  assert.ok(getByText("Votar en nombre del club"));
  // Permission codes never reach the screen.
  assert.equal(queryByText("reuniones.vote.cast"), null);

  // Actions appear once the person's permissions are known.
  await waitFor(() => assert.ok(getByRole("button", { name: "Instalar" })));
  fireEvent.click(getByRole("button", { name: "Instalar" }));
  await waitFor(() => assert.ok(getByText("Instalar Reuniones distritales")));
  // Defaults from the schema are pre-filled.
  assert.equal(
    (getByLabelText(/Votos por club/) as HTMLInputElement).value,
    "1",
  );
  // An empty required field is caught before sending.
  fireEvent.click(getByRole("button", { name: "Instalar y activar" }));
  await waitFor(() =>
    assert.ok(getByText("Falta completar «Email de contacto del club».")),
  );
  assert.equal(installBody, undefined);

  // The Kernel's Spanish error shows under the field.
  fireEvent.change(getByLabelText(/Email de contacto del club/), {
    target: { value: "no-es-email" },
  });
  fireEvent.click(getByRole("button", { name: "Instalar y activar" }));
  await findByText(
    "«Email de contacto del club» tiene que ser un email válido.",
  );

  fireEvent.change(getByLabelText(/Email de contacto del club/), {
    target: { value: "club@example.org" },
  });
  fireEvent.click(getByRole("button", { name: "Instalar y activar" }));
  await waitFor(() => assert.ok(activated));
  assert.deepEqual(installBody, {
    configuration: {
      emailContacto: "club@example.org",
      votosPorClub: 1,
      avisarPorEmail: true,
    },
  });
  await waitFor(() => assert.ok(getByText("Activo")));
  assert.ok(getByRole("link", { name: /Abrir/ }));
  assert.ok(
    backend.kernelCalls.some((call) =>
      call.url.includes(`/modules?organizationId=${CLUB.id}`),
    ),
  );
  tokenManager.clearSession();
});

test("Módulos — an active module can be configured and deactivated", async () => {
  let configureBody: Record<string, unknown> | undefined;
  let suspended = false;
  backendWith(PRESIDENT, async (request, url) => {
    if (url.pathname.endsWith("/api/kernel/v1/modules"))
      return jsonResponse([MODULE]);
    if (url.pathname.endsWith(`/organizations/${CLUB.id}/modules`))
      return jsonResponse([
        installation(suspended ? "SUSPENDED" : "ACTIVE", {
          emailContacto: "club@example.org",
          votosPorClub: 2,
          avisarPorEmail: false,
        }),
      ]);
    if (url.pathname.endsWith("/configuration") && request.method === "PATCH") {
      configureBody = (await request.json()) as Record<string, unknown>;
      return jsonResponse(installation("ACTIVE", configureBody.configuration));
    }
    if (url.pathname.endsWith("/suspend")) {
      suspended = true;
      return jsonResponse(installation("SUSPENDED"));
    }
    return undefined;
  });

  const { getByText, getByRole, getByLabelText } = renderModules(CLUB);
  await waitFor(() => assert.ok(getByText("Activo")));

  await waitFor(() => assert.ok(getByRole("button", { name: "Configurar" })));
  fireEvent.click(getByRole("button", { name: "Configurar" }));
  await waitFor(() => assert.ok(getByText("Configurar Reuniones distritales")));
  // The saved configuration is loaded into the form.
  assert.equal(
    (getByLabelText(/Email de contacto del club/) as HTMLInputElement).value,
    "club@example.org",
  );
  assert.equal(
    (getByLabelText(/Votos por club/) as HTMLInputElement).value,
    "2",
  );
  fireEvent.change(getByLabelText(/Idioma/), { target: { value: "pt" } });
  fireEvent.click(getByRole("button", { name: "Guardar" }));
  await waitFor(() => assert.ok(configureBody));
  assert.deepEqual(configureBody, {
    configuration: {
      emailContacto: "club@example.org",
      votosPorClub: 2,
      avisarPorEmail: false,
      idioma: "pt",
    },
  });

  await waitFor(() => assert.ok(getByRole("button", { name: "Desactivar" })));
  fireEvent.click(getByRole("button", { name: "Desactivar" }));
  await waitFor(() => assert.ok(getByText("Desactivar Reuniones distritales")));
  const dialogButtons = Array.from(
    document.querySelectorAll('[role="dialog"] button'),
  ) as HTMLButtonElement[];
  dialogButtons.find((button) => button.textContent === "Desactivar")!.click();
  await waitFor(() => assert.ok(getByText("Desactivado")));
  assert.ok(getByRole("button", { name: "Activar" }));
  tokenManager.clearSession();
});

test("Módulos — without install permission there are no actions", async () => {
  backendWith(["kernel.module.read"], (_request, url) => {
    if (url.pathname.endsWith("/api/kernel/v1/modules"))
      return jsonResponse([MODULE]);
    if (url.pathname.endsWith(`/organizations/${CLUB.id}/modules`))
      return jsonResponse([]);
    return undefined;
  });
  const { getByText, queryByRole } = renderModules(CLUB);
  await waitFor(() => assert.ok(getByText("Reuniones distritales")));
  assert.equal(queryByRole("button", { name: "Instalar" }), null);
  tokenManager.clearSession();
});

test("Módulos — the district sees which clubs use each module, and the RDR can publish", async () => {
  backendWith(
    [...PRESIDENT, "kernel.module.register", "kernel.app.read"],
    (_request, url) => {
      if (url.pathname.endsWith("/api/kernel/v1/modules"))
        return jsonResponse([MODULE]);
      if (url.pathname.endsWith(`/organizations/${DISTRICT.id}/modules`))
        return jsonResponse([]);
      if (url.pathname.endsWith("/developer/apps")) return jsonResponse([]);
      if (
        url.pathname.endsWith(
          `/organizations/${DISTRICT.id}/module-installations`,
        )
      )
        return jsonResponse([
          {
            ...installation("ACTIVE"),
            organizationName: CLUB.name,
            organizationType: "CLUB",
          },
          {
            ...installation("PENDING"),
            id: "inst_2",
            organizationId: "org_other",
            organizationName: "Rotaract Club Luque",
            organizationType: "CLUB",
          },
        ]);
      return undefined;
    },
  );
  const { getByText, getByRole, findByText } = renderModules(DISTRICT);
  await waitFor(() => assert.ok(getByText("Reuniones distritales")));
  await waitFor(() =>
    assert.ok(getByRole("button", { name: "Publicar módulo" })),
  );
  assert.ok(getByRole("button", { name: "Publicar versión" }));

  const clubsTab = getByRole("tab", { name: "En los clubes" });
  fireEvent.mouseDown(clubsTab);
  fireEvent.click(clubsTab);
  await findByText(CLUB.name);
  assert.ok(getByText("Rotaract Club Luque"));
  assert.ok(getByText("Falta activar"));
  tokenManager.clearSession();
});

test("Módulos — publishing a manifest lists the Kernel's errors per field", async () => {
  let body: Record<string, unknown> | undefined;
  backendWith(
    [...PRESIDENT, "kernel.module.register", "kernel.app.read"],
    async (request, url) => {
      if (
        url.pathname.endsWith("/api/kernel/v1/modules") &&
        request.method === "POST"
      ) {
        body = (await request.json()) as Record<string, unknown>;
        return jsonResponse(
          {
            type: "about:blank",
            title: "Request failed",
            status: 422,
            code: "KERNEL_MODULE_MANIFEST_INVALID",
            detail: "El manifiesto no es válido.",
            instance: url.pathname,
            errors: [
              {
                path: "permissions[0].code",
                message:
                  "El permiso «kernel.x.y» tiene que empezar con «reuniones.».",
              },
            ],
          },
          422,
        );
      }
      if (url.pathname.endsWith("/api/kernel/v1/modules"))
        return jsonResponse([]);
      if (url.pathname.endsWith(`/organizations/${DISTRICT.id}/modules`))
        return jsonResponse([]);
      if (url.pathname.endsWith("/developer/apps"))
        return jsonResponse([
          {
            id: "app_1",
            clientId: "mra_x",
            name: "Reuniones",
            description: null,
            type: "CONFIDENTIAL",
            status: "ACTIVE",
            organizationId: DISTRICT.id,
            ownerPersonId: "per_1",
            grantTypes: ["client_credentials"],
            scopes: [],
            redirectUris: [],
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
          },
        ]);
      return undefined;
    },
  );
  const { getByText, getByRole, getByLabelText, findByText } =
    renderModules(DISTRICT);
  await waitFor(() =>
    assert.ok(getByText("Todavía no hay módulos disponibles")),
  );
  await waitFor(() =>
    assert.ok(getByRole("button", { name: "Publicar módulo" })),
  );
  fireEvent.click(getByRole("button", { name: "Publicar módulo" }));
  await waitFor(() => assert.ok(getByLabelText(/App dueña del módulo/)));
  await waitFor(() => assert.ok(getByText("Reuniones")));
  fireEvent.change(getByLabelText(/App dueña del módulo/), {
    target: { value: "app_1" },
  });
  fireEvent.change(getByLabelText(/Manifiesto/), {
    target: { value: "{ no es json" },
  });
  fireEvent.click(getByRole("button", { name: "Publicar" }));
  await findByText(/El texto no es un JSON válido/);
  assert.equal(body, undefined);

  fireEvent.change(getByLabelText(/Manifiesto/), {
    target: { value: JSON.stringify({ id: "reuniones" }) },
  });
  fireEvent.click(getByRole("button", { name: "Publicar" }));
  await findByText(
    "El permiso «kernel.x.y» tiene que empezar con «reuniones.».",
  );
  assert.deepEqual(body, { appId: "app_1", manifest: { id: "reuniones" } });
  tokenManager.clearSession();
});

test("Cargos — module permissions are offered grouped by module, read from the district", async () => {
  const backend = backendWith(["kernel.position.manage"], (_request, url) => {
    if (url.pathname.endsWith("/api/kernel/v1/permissions"))
      return jsonResponse([
        permission("kernel.membership.read", "Ver socios", null),
        ...MODULE.permissions,
      ]);
    if (url.pathname.endsWith("/api/kernel/v1/modules"))
      return jsonResponse([MODULE]);
    if (url.pathname.endsWith("/position-definitions/pos_1/permissions"))
      return jsonResponse([MODULE.permissions[0]]);
    return undefined;
  });
  const { getByText, getByLabelText } = renderWithClient(
    React.createElement(PositionPermissionsPanel, {
      position: {
        id: "pos_1",
        code: "CLUB_PRESIDENT",
        name: "Presidencia de club",
        description: null,
        organizationType: "CLUB",
        ownerOrganizationId: DISTRICT.id,
        editPermissionCode: "kernel.position.manage",
        defaultRoleCode: "CLUB_PRESIDENT",
        isSingletonPerPeriod: true,
        isSystem: true,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      } as never,
      ownerName: DISTRICT.name,
    }),
  );
  await waitFor(() => assert.ok(getByText("Votar en nombre del club")));
  await waitFor(() => assert.ok(getByText("Módulo Reuniones distritales")));
  const select = getByLabelText("Agregar un permiso") as HTMLSelectElement;
  await waitFor(() =>
    assert.deepEqual(
      Array.from(select.querySelectorAll("optgroup")).map((g) => g.label),
      ["Mi Rotaract", "Módulo Reuniones distritales"],
    ),
  );
  assert.ok(
    backend.kernelCalls.some((call) =>
      call.url.includes(`/permissions?organizationId=${DISTRICT.id}`),
    ),
  );
  tokenManager.clearSession();
});

test("groupByModule puts Mi Rotaract first and sorts by name", () => {
  const groups = groupByModule(
    [
      permission("b.x.y", "Zeta", "b"),
      permission("kernel.a.b", "Beta", null),
      permission("a.x.y", "Alfa", "a"),
      permission("kernel.c.d", "Alfa kernel", null),
    ] as never,
    (id) => (id === "a" ? "Asistencia" : id === "b" ? "Becas" : undefined),
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.permissions.map((p) => p.name)]),
    [
      ["Mi Rotaract", ["Alfa kernel", "Beta"]],
      ["Módulo Asistencia", ["Alfa"]],
      ["Módulo Becas", ["Zeta"]],
    ],
  );
});

test("schema form helpers: defaults, required and compact", () => {
  assert.deepEqual(schemaForm.withDefaults(CONFIGURATION_SCHEMA, {}), {
    votosPorClub: 1,
    avisarPorEmail: true,
  });
  assert.deepEqual(
    schemaForm.missingRequired(CONFIGURATION_SCHEMA, { emailContacto: " " }),
    { emailContacto: "Falta completar «Email de contacto del club»." },
  );
  assert.deepEqual(
    schemaForm.compact(CONFIGURATION_SCHEMA, {
      emailContacto: "",
      idioma: "es",
    }),
    { idioma: "es" },
  );
  assert.equal(schemaForm.humanize("votosPorClub"), "Votos por club");
  assert.deepEqual(
    schemaForm.errorsByPath([
      { path: "a", message: "uno" },
      { path: "a", message: "dos" },
    ]),
    { a: "uno" },
  );
});
