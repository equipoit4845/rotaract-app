import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MethodBadge, OperationCard } from "@/components/operation-card";
import { ReferenceSidebar } from "@/components/reference-sidebar";
import { ConnectionBar } from "@/components/try-panel";
import { allTags } from "@/lib/openapi";

export const dynamicParams = false;

export function generateStaticParams() {
  return allTags().map((tag) => ({ tag: tag.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag: slug } = await params;
  const tag = allTags().find((candidate) => candidate.slug === slug);
  return tag
    ? { title: `API · ${tag.name}`, description: tag.description }
    : {};
}

export default async function TagReference({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: slug } = await params;
  const tags = allTags();
  const tag = tags.find((candidate) => candidate.slug === slug);
  if (!tag) notFound();
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
          <ReferenceSidebar tags={tags} current={tag.slug} />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Referencia de la API
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{tag.name}</h1>
          {tag.description ? (
            <p className="mt-3 max-w-3xl text-muted-foreground">
              {tag.description}
            </p>
          ) : null}
          <ul className="mt-5 grid gap-1.5 sm:grid-cols-2">
            {tag.operations.map((operation) => (
              <li key={operation.operationId}>
                <a
                  href={`#${operation.operationId}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted"
                >
                  <MethodBadge method={operation.method} />
                  <span
                    className={`truncate ${operation.deprecated ? "line-through" : ""}`}
                  >
                    {operation.summary}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </header>
        <ConnectionBar />
        <div className="mt-4">
          {tag.operations.map((operation) => (
            <OperationCard key={operation.operationId} operation={operation} />
          ))}
        </div>
      </div>
    </div>
  );
}
