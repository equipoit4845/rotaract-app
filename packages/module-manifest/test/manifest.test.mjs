import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  isModulePermission,
  manifestSchema,
  MANIFEST_SCHEMA_URL,
  permissionNamespace,
  RESERVED_MODULE_IDS,
  validateConfiguration,
  validateManifest,
} from "../src/index.js";

const example = JSON.parse(
  readFileSync(
    new URL("../examples/reuniones/mirotaract.module.json", import.meta.url),
    "utf8",
  ),
);
const clone = () => structuredClone(example);
const messages = (result) => result.errors.map((error) => error.message);
const paths = (result) => result.errors.map((error) => error.path);

test("the reuniones example is a valid v1 manifest", () => {
  const result = validateManifest(example);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(example.$schema, MANIFEST_SCHEMA_URL);
});

test("the example only subscribes to events of the public catalog", () => {
  const catalog = [
    "membership.created.v1",
    "membership.activated.v1",
    "membership.ended.v1",
    "appointment.activated.v1",
    "appointment.ended.v1",
    "organization.updated.v1",
    "organization.archived.v1",
    "person.updated.v1",
    "period.created.v1",
  ];
  assert.equal(validateManifest(example, { knownEventTypes: catalog }).ok, true);
  const manifest = clone();
  manifest.events.subscribes.push("meeting.started.v1");
  const result = validateManifest(manifest, { knownEventTypes: catalog });
  assert.equal(result.ok, false);
  assert.deepEqual(paths(result), ["events.subscribes[5]"]);
  assert.match(messages(result)[0], /no existe en el catálogo/);
});

test("non-objects are rejected without throwing", () => {
  for (const value of [null, undefined, 3, "x", []]) {
    const result = validateManifest(value);
    assert.equal(result.ok, false);
    assert.match(result.errors[0].message, /objeto JSON/);
  }
});

test("missing required fields are reported in Spanish", () => {
  const result = validateManifest({});
  assert.equal(result.ok, false);
  assert.deepEqual(
    paths(result).sort(),
    ["contractVersion", "id", "name", "permissions", "version"],
  );
  assert.ok(messages(result).includes("Falta completar «Identificador»."));
});

test("permission codes must live in the module's namespace", () => {
  const manifest = clone();
  manifest.permissions[0].code = "kernel.person.manage";
  manifest.permissions[1].code = "meetings.vote.cast";
  const result = validateManifest(manifest);
  assert.equal(result.ok, false);
  assert.deepEqual(paths(result), [
    "permissions[0].code",
    "permissions[1].code",
  ]);
  assert.match(messages(result)[0], /tiene que empezar con «reuniones\.»/);
});

test("a code that only repeats the module id is not namespaced", () => {
  assert.equal(isModulePermission("reuniones", "reuniones.meeting.manage"), true);
  assert.equal(isModulePermission("reuniones", "reuniones."), false);
  assert.equal(isModulePermission("reuniones", "reunionesx.meeting.manage"), false);
  assert.equal(isModulePermission("reuniones", "reuniones"), false);
  assert.equal(permissionNamespace("reuniones.vote.cast"), "reuniones");
});

test("permission codes need <namespace>.<resource>.<action>", () => {
  const manifest = clone();
  manifest.permissions[0].code = "reuniones.vote";
  const result = validateManifest(manifest);
  assert.equal(result.ok, false);
  assert.deepEqual(paths(result), ["permissions[0].code"]);
  assert.match(messages(result)[0], /no tiene el formato esperado/);
});

test("duplicate permission codes are rejected", () => {
  const manifest = clone();
  manifest.permissions.push({ ...manifest.permissions[0] });
  const result = validateManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(messages(result)[0], /está repetido/);
});

test("reserved and malformed ids are rejected", () => {
  for (const id of RESERVED_MODULE_IDS) {
    const manifest = { ...clone(), id, permissions: [] };
    assert.equal(validateManifest(manifest).ok, false, id);
  }
  for (const id of ["Reuniones", "re", "-reuniones", "reuniones-", "reu niones", "reuniones.x"]) {
    const manifest = { ...clone(), id, permissions: [] };
    assert.equal(validateManifest(manifest).ok, false, id);
  }
});

test("version must be semver and contractVersion must be 1", () => {
  const manifest = clone();
  manifest.version = "1.0";
  manifest.contractVersion = 2;
  const result = validateManifest(manifest);
  assert.deepEqual(paths(result).sort(), ["contractVersion", "version"]);
  assert.ok(messages(result).includes("«Versión del contrato» tiene que ser 1."));
});

test("emitted events must be namespaced", () => {
  const manifest = clone();
  manifest.events.emits = ["meeting.closed.v1"];
  const result = validateManifest(manifest);
  assert.deepEqual(paths(result), ["events.emits[0]"]);
});

test("unknown top-level fields are rejected (typos)", () => {
  const manifest = clone();
  manifest.permisos = [];
  const result = validateManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(messages(result)[0], /«permisos» no es un campo conocido/);
});

test("ui.entryUrl must be https except localhost", () => {
  const manifest = clone();
  manifest.ui.entryUrl = "http://reuniones.example.org";
  assert.deepEqual(paths(validateManifest(manifest)), ["ui.entryUrl"]);
  manifest.ui.entryUrl = "http://localhost:3002";
  assert.equal(validateManifest(manifest).ok, true);
});

test("configurationSchema must compile and have an object root", () => {
  const manifest = clone();
  manifest.configurationSchema = { type: "string" };
  let result = validateManifest(manifest);
  assert.deepEqual(paths(result), ["configurationSchema"]);
  assert.match(messages(result)[0], /tipo "object"/);
  manifest.configurationSchema = { type: "object", properties: { a: { type: "nope" } } };
  result = validateManifest(manifest);
  assert.deepEqual(paths(result), ["configurationSchema"]);
  assert.match(messages(result)[0], /no es un JSON Schema válido/);
});

test("the schema is draft-07 and published under the developers domain", () => {
  assert.equal(manifestSchema.$schema, "http://json-schema.org/draft-07/schema#");
  assert.match(MANIFEST_SCHEMA_URL, /^https:\/\/developers\.rotaract4845\.com\//);
});

// --- configuration ---------------------------------------------------------

const schema = example.configurationSchema;

test("a valid configuration passes and gets the schema defaults", () => {
  const result = validateConfiguration(schema, { emailContacto: "club@example.org" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    emailContacto: "club@example.org",
    votosPorClub: 1,
    avisarPorEmail: true,
    idioma: "es",
  });
});

test("defaults are applied to a copy, never to the caller's object", () => {
  const input = { emailContacto: "club@example.org" };
  validateConfiguration(schema, input);
  assert.deepEqual(input, { emailContacto: "club@example.org" });
});

test("configuration errors use the field titles, in Spanish", () => {
  const result = validateConfiguration(schema, {
    votosPorClub: 5,
    avisarPorEmail: "sí",
    idioma: "en",
    color: "rojo",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(messages(result).sort(), [
    "Falta completar «Email de contacto del club».",
    "«Avisar por email cuando se convoca una reunión» tiene que ser sí o no.",
    "«Idioma de las actas» tiene que ser uno de estos valores: \"es\", \"pt\".",
    "«Votos por club» tiene que ser 2 o menos.",
    "«color» no es un campo conocido. Revisá si está bien escrito.",
  ].sort());
  assert.deepEqual(paths(result).sort(), [
    "avisarPorEmail",
    "color",
    "emailContacto",
    "idioma",
    "votosPorClub",
  ]);
});

test("formats are explained", () => {
  const result = validateConfiguration(schema, { emailContacto: "no-es-un-email" });
  assert.deepEqual(messages(result), [
    "«Email de contacto del club» tiene que ser un email válido.",
  ]);
});

test("nested fields without title use their path", () => {
  const nested = {
    type: "object",
    properties: {
      horarios: {
        type: "array",
        items: {
          type: "object",
          required: ["dia"],
          properties: { dia: { type: "string", minLength: 1 } },
        },
      },
    },
  };
  const result = validateConfiguration(nested, { horarios: [{ dia: "" }, {}] });
  assert.deepEqual(messages(result).sort(), [
    "Falta completar «horarios[1].dia».",
    "«horarios[0].dia» no puede quedar vacío.",
  ]);
});

test("the root must be an object", () => {
  const result = validateConfiguration(schema, "hola");
  assert.equal(result.ok, false);
  assert.deepEqual(messages(result), ["La configuración tiene que ser un objeto."]);
});

test("a module without configurationSchema accepts any object", () => {
  assert.equal(validateConfiguration(null, { a: 1 }).ok, true);
  assert.equal(validateConfiguration(undefined, undefined).ok, true);
  assert.equal(validateConfiguration(null, [1]).ok, false);
});

test("anyOf noise is summarised in one message", () => {
  const anyOf = {
    type: "object",
    properties: { limite: { anyOf: [{ type: "integer" }, { const: "sin límite" }] } },
  };
  const result = validateConfiguration(anyOf, { limite: "mucho" });
  assert.deepEqual(messages(result), [
    "«limite» no coincide con ninguna de las opciones posibles.",
  ]);
});
