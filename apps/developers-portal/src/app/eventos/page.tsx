import { notFound } from "next/navigation";

import { DocPage } from "@/components/doc-page";
import { getDoc } from "@/lib/content";

export const metadata = {
  title: "Catálogo de eventos",
  description:
    "Todos los eventos que Mi Rotaract envía por webhook, con su scope, sus campos y un ejemplo.",
};

/**
 * docs/developers/catalogo-de-eventos.md is generated from the same source
 * the kernel uses to emit events (pnpm docs:events), so it is the catalog.
 */
export default function EventCatalog() {
  const doc = getDoc("catalogo-de-eventos");
  if (!doc) notFound();
  return <DocPage doc={doc} />;
}
