import Link from "next/link";

import { Logo } from "./logo";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/docs", label: "Guías" },
  { href: "/quickstarts", label: "Quickstarts" },
  { href: "/ia", label: "IA" },
  { href: "/referencia", label: "API" },
  { href: "/eventos", label: "Eventos" },
  { href: "/changelog", label: "Changelog" },
  { href: "/estado", label: "Estado" }, // E12
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-6">
        <Link
          href="/"
          aria-label="Mi Rotaract para desarrolladores"
          className="flex shrink-0 items-center gap-2.5 font-semibold text-foreground"
        >
          <Logo variant="mark" size={34} aria-hidden className="sm:hidden" />
          <Logo size={40} aria-hidden className="hidden sm:block" />
          <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
          <span className="hidden sm:inline">Mi Rotaract</span>
          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
            Developers
          </span>
        </Link>
        <div className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SearchBox />
          <ThemeToggle />
        </div>
      </nav>
      <div className="flex flex-wrap gap-x-1 border-t border-border px-3 py-1 lg:hidden">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </header>
  );
}

export function SiteFooter({ contractVersion }: { contractVersion: string }) {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Logo size={40} className="shrink-0" />
          <p>
            Mi Rotaract para desarrolladores · Contrato de la API v
            {contractVersion}
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/docs/seguridad" className="hover:text-foreground">
            Seguridad
          </Link>
          <Link href="/docs/deprecaciones" className="hover:text-foreground">
            Deprecaciones
          </Link>
          <a href="/llms.txt" className="hover:text-foreground">
            llms.txt
          </a>
          <a href="/openapi.yaml" className="hover:text-foreground">
            OpenAPI
          </a>
        </div>
      </div>
    </footer>
  );
}
