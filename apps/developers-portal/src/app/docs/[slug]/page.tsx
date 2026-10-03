import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DocPage } from "@/components/doc-page";
import { docs, getDoc } from "@/lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return docs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const doc = getDoc((await params).slug);
  return doc
    ? {
        title: doc.title,
        description: doc.description,
        alternates: { types: { "text/markdown": `/docs/${doc.slug}.md` } },
      }
    : {};
}

export default async function DocRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const doc = getDoc((await params).slug);
  if (!doc) notFound();
  return <DocPage doc={doc} />;
}
