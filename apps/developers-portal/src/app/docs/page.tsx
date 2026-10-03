import { notFound } from "next/navigation";

import { DocPage } from "@/components/doc-page";
import { getDoc } from "@/lib/content";

export const metadata = { title: "Guías" };

export default function DocsIndex() {
  const doc = getDoc("introduccion");
  if (!doc) notFound();
  return <DocPage doc={doc} />;
}
