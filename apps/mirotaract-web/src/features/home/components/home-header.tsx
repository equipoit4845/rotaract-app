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
          className="flex items-center gap-2 font-semibold text-foreground"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Logo size={18} />
          </span>
          Mi Rotaract
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
