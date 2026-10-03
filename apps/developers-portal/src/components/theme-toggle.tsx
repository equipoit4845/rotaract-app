"use client";

import { Moon, Sun } from "lucide-react";

/** Light/dark like Mi Rotaract; the choice is a per-browser convenience. */
export function ThemeToggle() {
  function toggle() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("mr-theme", dark ? "dark" : "light");
    } catch {
      /* storage unavailable: the toggle still works for this page */
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema claro u oscuro"
      className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Sun className="size-4 dark:hidden" aria-hidden />
      <Moon className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}

/** Inline, before paint: avoids a flash of the wrong theme. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("mr-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;
