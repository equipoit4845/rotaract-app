import SwaggerParser from "@apidevtools/swagger-parser";

await SwaggerParser.validate(
  new URL("../kernel-openapi.yaml", import.meta.url).pathname,
);
console.log("OpenAPI 3.1 contract is valid");
