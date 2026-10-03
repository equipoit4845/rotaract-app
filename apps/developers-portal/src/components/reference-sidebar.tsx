import Link from "next/link";

import { DEVELOPER_TAGS, type Tag } from "@/lib/openapi";

export function ReferenceSidebar({
  tags,
  current,
}: {
  tags: Tag[];
  current?: string;
}) {
  const forApps = tags.filter((tag) => DEVELOPER_TAGS.includes(tag.name));
  const platform = tags.filter((tag) => !DEVELOPER_TAGS.includes(tag.name));
  const group = (title: string, items: Tag[]) => (
    <div>
      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((tag) => (
          <li key={tag.slug}>
            <Link
              href={`/referencia/${tag.slug}`}
              aria-current={tag.slug === current ? "page" : undefined}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                tag.slug === current
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tag.name}
              <span className="text-xs opacity-70">
                {tag.operations.length}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <nav aria-label="Referencia de la API" className="space-y-6 text-sm">
      {group("Para apps", forApps)}
      {group("Plataforma (consola y kernel)", platform)}
    </nav>
  );
}
