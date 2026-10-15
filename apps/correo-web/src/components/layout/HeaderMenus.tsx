"use client";

import { CalendarDays, Grid3x3, House, LogOut, Mail } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { MIROTARACT_URL, REUNIONES_URL } from "@/lib/config";
import { cn } from "@/lib/utils";

/** A button with a panel under it; closes on outside click or Escape. */
function Popover({
  label,
  button,
  children,
  align = "right",
}: {
  label: string;
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "right" | "left";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {button}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-50 mt-2 rounded-xl border bg-popover p-2 shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

const APPS = [
  {
    name: "Mi Rotaract",
    description: "Clubes, socios y cargos",
    href: MIROTARACT_URL,
    icon: House,
  },
  {
    name: "Reuniones",
    description: "Reuniones distritales",
    href: REUNIONES_URL,
    icon: CalendarDays,
  },
  {
    name: "Correo",
    description: "Estás acá",
    href: "/bandeja",
    icon: Mail,
    current: true,
  },
];

/** The Google-style grid: jump to the other apps of the district. */
export function AppsMenu() {
  return (
    <Popover label="Apps del distrito" button={<Grid3x3 className="size-5" />}>
      {() => (
        <ul className="grid w-72 grid-cols-3 gap-1">
          {APPS.map((app) => (
            <li key={app.name}>
              <a
                href={app.href}
                role="menuitem"
                aria-current={app.current ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-center hover:bg-muted",
                  app.current && "bg-primary/5",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <app.icon className="size-5" aria-hidden />
                </span>
                <span className="text-xs font-medium text-foreground">
                  {app.name}
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {app.description}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

const initialsOf = (name: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Avatar with the person's name, a link to Mi Rotaract and sign out. */
export function AccountMenu({
  name,
  detail,
}: {
  name: string | null;
  detail?: string;
}) {
  return (
    <Popover
      label="Tu cuenta"
      button={
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {initialsOf(name)}
        </span>
      }
    >
      {() => (
        <div className="w-64">
          <div className="flex items-center gap-3 border-b px-2 pb-3 pt-1">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {initialsOf(name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                {name ?? "Tu cuenta"}
              </span>
              {detail ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {detail}
                </span>
              ) : null}
            </span>
          </div>
          <a
            href={MIROTARACT_URL}
            role="menuitem"
            className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted"
          >
            <House className="size-4 text-muted-foreground" aria-hidden />
            Ir a Mi Rotaract
          </a>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted"
            >
              <LogOut className="size-4 text-muted-foreground" aria-hidden />
              Salir
            </button>
          </form>
        </div>
      )}
    </Popover>
  );
}
