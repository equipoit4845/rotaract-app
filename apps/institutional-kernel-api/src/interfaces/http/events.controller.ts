import { Controller, Get } from "@nestjs/common";

import { catalogDocument } from "../../application/webhooks/catalog";

/** E7.3 — public event catalog (no authentication). */
@Controller("events")
export class EventsController {
  @Get("catalog") getEventCatalog() {
    return catalogDocument();
  }
}
