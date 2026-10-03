import { notFound } from "next/navigation";

import { DocPage } from "@/components/doc-page";
import { getDoc } from "@/lib/content";

export const metadata = {
  title: "Changelog",
  description:
    "Cambios de la API, los SDKs y la CLI de Mi Rotaract, y la política de deprecación de 6 meses.",
};

export default function Changelog() {
  const doc = getDoc("changelog");
  if (!doc) notFound();
  return <DocPage doc={doc} />;
}
