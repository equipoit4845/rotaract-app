import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/layout";
import { buttonVariants } from "@/components/ui";
import Link from "next/link";

const SECTIONS = [
  { href: "#capacidades", label: "Qué incluye" },
  { href: "#acceso", label: "Cómo se accede" },
] as const;

export function HomeHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 font-semibold text-foreground"
        >
          <Logo size={36} />
          <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
          <span className="hidden sm:inline">Mi Rotaract</span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
            >
              {section.label}
            </a>
          ))}
          <ThemeToggle />
          <Link href="/login" className={buttonVariants({ size: "md" })}>
            Ingresar
          </Link>
        </div>
      </nav>
    </header>
  );
}
