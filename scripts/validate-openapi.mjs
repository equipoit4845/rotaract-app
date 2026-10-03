import SwaggerParser from "@apidevtools/swagger-parser";

const file = new URL("../kernel-openapi.yaml", import.meta.url).pathname;
await SwaggerParser.validate(file);

// E9.4 (docs/developers/deprecaciones.md): an operation marked `deprecated`
// must say since when (`x-deprecated-at`) and until when (`x-sunset`), with
// at least 6 months in between. The kernel turns both into the
// Deprecation/Sunset response headers.
const document = await SwaggerParser.parse(file);
const problems = [];
for (const [path, methods] of Object.entries(document.paths ?? {})) {
  for (const [method, operation] of Object.entries(methods ?? {})) {
    if (!operation || typeof operation !== "object" || !operation.deprecated)
      continue;
    const name = `${method.toUpperCase()} ${path}`;
    const since = Date.parse(operation["x-deprecated-at"] ?? "");
    const sunset = Date.parse(operation["x-sunset"] ?? "");
    if (Number.isNaN(since)) problems.push(`${name}: falta x-deprecated-at`);
    if (Number.isNaN(sunset)) problems.push(`${name}: falta x-sunset`);
    if (!Number.isNaN(since) && !Number.isNaN(sunset)) {
      const minimum = new Date(since);
      minimum.setUTCMonth(minimum.getUTCMonth() + 6);
      if (sunset < minimum.getTime())
        problems.push(
          `${name}: x-sunset tiene que ser al menos 6 meses después de x-deprecated-at`,
        );
    }
  }
}
if (problems.length)
  throw new Error(`Deprecation policy violations:\n${problems.join("\n")}`);
console.log("OpenAPI 3.1 contract is valid");
