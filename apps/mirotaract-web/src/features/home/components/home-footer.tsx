import { Logo } from "@/components/brand";
import Link from "next/link";

export function HomeFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-muted-foreground md:flex-row md:px-6">
        <span className="flex items-center gap-3 font-medium text-foreground">
          <Logo size={40} />
          <span aria-hidden className="h-5 w-px bg-border" />
          Mi Rotaract
        </span>
        <div className="flex items-center gap-6">
          <Link
            href="/login"
            className="transition-colors hover:text-foreground"
          >
            Iniciar sesión
          </Link>
          <span>&copy; {year}</span>
        </div>
      </div>
    </footer>
  );
}
