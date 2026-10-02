import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "fs";
import { resolve } from "path";

import { SERVICE_SCOPES } from "../oauth/scopes";
import {
  ENVELOPE_SCHEMA,
  EVENT_CATALOG,
  PING_EVENT_TYPE,
  SUBSCRIBABLE_EVENT_TYPES,
  catalogDocument,
  exampleEnvelope,
} from "./catalog";
import { renderCatalogMarkdown } from "./catalog-docs";
import { validateEventTypes } from "./webhooks.service";

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));

describe("event catalog", () => {
  it("has unique, versioned types that match name + version", () => {
    const types = EVENT_CATALOG.map((event) => event.type);
    expect(new Set(types).size).toBe(types.length);
    for (const event of EVENT_CATALOG) {
      expect(event.type).toMatch(/^[a-z]+(\.[a-z-]+)*\.v\d+$/);
      expect(event.type).toBe(`${event.name}.v${event.version}`);
      if (event.scope) expect(SERVICE_SCOPES).toContain(event.scope);
    }
  });

  it("covers the E7 contract's minimum set", () => {
    expect(EVENT_CATALOG.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "membership.activated.v1",
        "membership.ended.v1",
        "membership.created.v1",
        "appointment.activated.v1",
        "appointment.ended.v1",
        "organization.updated.v1",
        "organization.archived.v1",
        "person.updated.v1",
        "period.created.v1",
        "ping.v1",
      ]),
    );
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(PING_EVENT_TYPE);
  });

  it.each(EVENT_CATALOG.map((event) => [event.type, event]))(
    "%s: the example is valid against its own schema and the envelope",
    (_type, event) => {
      const validateData = ajv.compile(event.schema);
      expect(validateData(event.example)).toBe(true);
      const validateEnvelope = ajv.compile(ENVELOPE_SCHEMA);
      expect(validateEnvelope(exampleEnvelope(event))).toBe(true);
    },
  );

  it("serves every type with its example body", () => {
    const document = catalogDocument();
    expect(document.version).toBe(1);
    expect(document.signature.headers.signature).toBe("MiRotaract-Signature");
    expect(document.events).toHaveLength(EVENT_CATALOG.length);
    expect(document.events[0].example.id).toMatch(/^evt_/);
  });

  it("docs/developers/catalogo-de-eventos.md is generated from it (pnpm docs:events)", () => {
    const committed = readFileSync(
      resolve(
        __dirname,
        "../../../../../docs/developers/catalogo-de-eventos.md",
      ),
      "utf8",
    );
    expect(committed).toBe(renderCatalogMarkdown());
  });
});

describe("subscription validation", () => {
  const scopes = [
    "kernel.service.memberships.read",
    "kernel.service.authorities.read",
  ];

  it("accepts catalog types the app has scopes for, deduplicated", () => {
    expect(
      validateEventTypes(
        [
          "membership.activated.v1",
          "membership.activated.v1",
          "appointment.activated.v1",
        ],
        scopes,
      ),
    ).toEqual(["membership.activated.v1", "appointment.activated.v1"]);
  });

  it("rejects unknown types, ping, empty lists and missing scopes", () => {
    expect(() => validateEventTypes([], scopes)).toThrow(/al menos un evento/);
    expect(() => validateEventTypes(["membership.deleted.v1"], scopes)).toThrow(
      /desconocido/,
    );
    expect(() => validateEventTypes(["ping.v1"], scopes)).toThrow(
      /desconocido/,
    );
    expect(() => validateEventTypes(["period.created.v1"], scopes)).toThrow(
      /kernel.service.periods.read/,
    );
    expect(() =>
      validateEventTypes("membership.activated.v1", scopes),
    ).toThrow();
  });
});
