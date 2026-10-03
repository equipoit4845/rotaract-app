import Link from "next/link";

import { nav, type Doc } from "@/lib/content";
import { renderMarkdown } from "@/lib/markdown";
import { chatGptUrl, claudeUrl } from "@/lib/site";

import { DocActions } from "./doc-actions";

export function DocsSidebar({ current }: { current?: string }) {
  return (
    <nav aria-label="Guías" className="space-y-6 text-sm">
      {nav.map((group) => (
        <div key={group.title}>
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </p>
          <ul className="space-y-0.5">
            {group.pages.map((page) => {
              const active = page.slug === current;
              return (
                <li key={page.slug}>
                  <Link
                    href={`/docs/${page.slug}`}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-2 py-1.5 transition-colors ${
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** A docs/developers page: sidebar, content, actions and outline. */
export function DocPage({ doc }: { doc: Doc }) {
  const html = renderMarkdown(doc.markdown);
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_13rem]">
      <aside className="hidden lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
          <DocsSidebar current={doc.slug} />
        </div>
      </aside>
      <article className="min-w-0">
        <div className="mb-6 flex flex-col gap-3 border-b border-border pb-4">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            {doc.group}
          </p>
          <DocActions
            slug={doc.slug}
            markdown={doc.markdown}
            claudeUrl={claudeUrl(doc.slug)}
            chatGptUrl={chatGptUrl(doc.slug)}
          />
        </div>
        <div className="prose-mr" dangerouslySetInnerHTML={{ __html: html }} />
        <details className="mt-10 rounded-xl border border-border p-4 text-sm lg:hidden">
          <summary className="cursor-pointer font-medium">
            Todas las guías
          </summary>
          <div className="mt-4">
            <DocsSidebar current={doc.slug} />
          </div>
        </details>
      </article>
      {doc.outline.length > 1 ? (
        <aside className="hidden xl:block">
          <div className="sticky top-24 text-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              En esta página
            </p>
            <ul className="space-y-1.5 border-l border-border">
              {doc.outline.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="-ml-px block border-l border-transparent pl-3 text-muted-foreground hover:border-primary hover:text-foreground"
                  >
                    {item.heading.replace(/`/g, "")}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
