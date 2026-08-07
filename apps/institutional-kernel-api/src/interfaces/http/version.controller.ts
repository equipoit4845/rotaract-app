import { Controller, Get } from "@nestjs/common";

@Controller()
export class VersionController {
  @Get("/version")
  version(): { service: string; version: string } {
    return { service: "institutional-kernel-api", version: "0.1.0" };
  }
}
