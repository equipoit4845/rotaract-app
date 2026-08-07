import { Logger, RequestMethod, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as swaggerUi from "swagger-ui-express";

import { AppModule } from "./app.module";
import { ProblemFilter } from "./interfaces/http/problem.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  registerPublicApiDocumentation(app);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new ProblemFilter());
  app.setGlobalPrefix("api/kernel/v1", {
    exclude: [{ path: "health/*path", method: RequestMethod.ALL }],
  });
  if (process.env.KERNEL_WORKER_ONLY === "true") {
    await app.init();
    Logger.log("Institutional Kernel worker started", "Bootstrap");
    return;
  }
  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
  Logger.log("Institutional Kernel API started", "Bootstrap");
}

/**
 * The OpenAPI file is the API's public, versioned contract.  Keep the UI
 * outside `/api/kernel/v1` so the latter remains a pure resource prefix.
 */
function registerPublicApiDocumentation(app: {
  use: (...args: any[]) => unknown;
}): void {
  const specification = [
    process.env.KERNEL_OPENAPI_PATH,
    resolve(process.cwd(), "kernel-openapi.yaml"),
    resolve(process.cwd(), "../../kernel-openapi.yaml"),
    resolve(__dirname, "../../../kernel-openapi.yaml"),
  ].find((candidate): candidate is string =>
    Boolean(candidate && existsSync(candidate)),
  );
  if (!specification) {
    Logger.warn(
      "OpenAPI specification was not found; /docs is unavailable",
      "Bootstrap",
    );
    return;
  }
  app.use("/openapi.yaml", (_request: unknown, response: any) => {
    response.type("application/yaml").sendFile(specification);
  });
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: "Institutional Kernel API v1",
      swaggerOptions: { url: "/openapi.yaml" },
    }),
  );
}

void bootstrap();
