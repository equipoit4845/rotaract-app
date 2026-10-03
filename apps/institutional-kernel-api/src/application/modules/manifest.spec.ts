import { readFileSync } from "fs";
import { resolve } from "path";

import {
  compareSemver,
  isModulePermission,
  validateConfiguration,
  validateManifest,
} from "./manifest";
import { MODULE_MANIFEST_SCHEMA } from "./module-manifest.schema";

const packageRoot = resolve(
  __dirname,
  "../../../../../packages/module-manifest",
);
const readJson = (path: string) =>
  JSON.parse(readFileSync(resolve(packageRoot, path), "utf8"));
const example = () => readJson("examples/reuniones/mirotaract.module.json");
const messages = (result: { errors: Array<{ message: string }> }) =>
  result.errors.map((error) => error.message);
const paths = (result: { errors: Array<{ path: string }> }) =>
  result.errors.map((error) => error.path);

describe("module manifest (kernel copy of @mirotaract/module-manifest)", () => {
  it("vendors exactly the package's JSON Schema", () => {
    expect(MODULE_MANIFEST_SCHEMA).toEqual(
      readJson("schema/module-manifest.v1.json"),
    );
  });

  it("accepts the reuniones example", () => {
    const result = validateManifest(example(), {
      knownEventTypes: [
        "appointment.activated.v1",
        "appointment.ended.v1",
        "membership.activated.v1",
        "membership.ended.v1",
        "organization.updated.v1",
      ],
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("keeps permission codes inside the module namespace", () => {
    const manifest = example();
    manifest.permissions[0].code = "kernel.person.manage";
    manifest.permissions[1].code = "reunionesx.vote.cast";
    const result = validateManifest(manifest);
    expect(result.ok).toBe(false);
    expect(paths(result)).toEqual([
      "permissions[0].code",
      "permissions[1].code",
    ]);
    expect(messages(result)[0]).toContain("tiene que empezar con «reuniones.»");
    expect(isModulePermission("reuniones", "reuniones.vote.cast")).toBe(true);
    expect(isModulePermission("reuniones", "reuniones.")).toBe(false);
    expect(isModulePermission("reuniones", "reunionesx.vote.cast")).toBe(false);
  });

  it("rejects duplicate codes, reserved ids and unknown events", () => {
    const manifest = example();
    manifest.permissions.push({ ...manifest.permissions[0] });
    manifest.events.subscribes.push("meeting.started.v1");
    const result = validateManifest(manifest, {
      knownEventTypes: manifest.events.subscribes.slice(0, -1),
    });
    expect(messages(result)).toEqual([
      expect.stringContaining("está repetido"),
      expect.stringContaining("no existe en el catálogo"),
    ]);
    expect(
      validateManifest({ ...example(), id: "kernel", permissions: [] }).ok,
    ).toBe(false);
  });

  it("explains missing fields in Spanish", () => {
    const result = validateManifest({ id: "x1y" });
    expect(messages(result)).toContain("Falta completar «Nombre».");
  });

  it("validates a configuration with Spanish messages and defaults", () => {
    const schema = example().configurationSchema;
    const ok = validateConfiguration(schema, { emailContacto: "a@b.org" });
    expect(ok).toEqual({
      ok: true,
      errors: [],
      value: {
        emailContacto: "a@b.org",
        votosPorClub: 1,
        avisarPorEmail: true,
        idioma: "es",
      },
    });
    const bad = validateConfiguration(schema, { votosPorClub: 0 });
    expect(bad.ok).toBe(false);
    expect(messages(bad).sort()).toEqual(
      [
        "Falta completar «Email de contacto del club».",
        "«Votos por club» tiene que ser 1 o más.",
      ].sort(),
    );
  });

  it("caches compiled schemas by content (rows are new objects on every read)", () => {
    const schema = example().configurationSchema;
    for (let i = 0; i < 5; i++)
      expect(
        validateConfiguration(JSON.parse(JSON.stringify(schema)), {
          emailContacto: "a@b.org",
        }).ok,
      ).toBe(true);
  });

  it("orders semantic versions", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.2.0", "1.10.0")).toBe(-1);
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(compareSemver("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareSemver("1.0.0", "1.0.0-rc.1")).toBe(1);
  });
});
