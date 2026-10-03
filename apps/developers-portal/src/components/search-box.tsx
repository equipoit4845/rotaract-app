"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { searchEntries, type SearchEntry as Entry } from "@/lib/search";

/** Header search over docs and API operations (public/search-index.json). */
export function SearchBox() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    if (entries) return;
    try {
      const response = await fetch("/search-index.json");
      setEntries((await response.json()) as Entry[]);
    } catch {
      setEntries([]);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        event.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      ) {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(
    () => searchEntries(entries ?? [], query),
    [entries, query],
  );

  function go(entry: Entry) {
    setOpen(false);
    setQuery("");
    router.push(entry.url);
  }

  return (
    <div className="relative">
      <label className="flex h-9 w-44 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring sm:w-64">
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="sr-only">Buscar en la documentación</span>
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Buscar… (/)"
          className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          onFocus={() => {
            void load();
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown")
              setActive((index) => Math.min(index + 1, results.length - 1));
            else if (event.key === "ArrowUp")
              setActive((index) => Math.max(index - 1, 0));
            else if (event.key === "Enter" && results[active])
              go(results[active]);
            else if (event.key === "Escape") setOpen(false);
          }}
          aria-controls="search-results"
          aria-expanded={open && results.length > 0}
          role="combobox"
        />
      </label>
      {open && query.trim() ? (
        <div
          id="search-results"
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-[min(92vw,28rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          {entries === null ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Cargando…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Sin resultados para “{query}”.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {results.map((entry, index) => (
                <li key={`${entry.url}-${index}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(entry)}
                    className={`block w-full px-4 py-2 text-left ${index === active ? "bg-muted" : "hover:bg-muted"}`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span className="rounded bg-primary/10 px-1.5 text-[10px] uppercase text-primary">
                        {entry.kind === "api" ? "API" : "Guía"}
                      </span>
                      <span className="truncate">{entry.title}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {entry.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
