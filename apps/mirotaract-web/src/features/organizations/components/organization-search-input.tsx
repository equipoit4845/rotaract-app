"use client";

import { Input } from "@equipoit4845/ui";
import { useEffect, useState } from "react";

/**
 * Local, debounced draft so typing doesn't push a new URL (and a new
 * `useOrganizations` request) on every keystroke — only after the person
 * pauses. The committed value still round-trips through the URL, never
 * localStorage (§13).
 */
export function OrganizationSearchInput({
  value,
  onCommit,
}: {
  value: string | undefined;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  // Deliberately keyed only on `draft` — `value`/`onCommit` change identity
  // on every parent render, and including them would reset the debounce
  // timer before it ever fires.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (draft !== (value ?? "")) onCommit(draft);
    }, 350);
    return () => clearTimeout(timeout);
  }, [draft]);

  return (
    <Input
      type="search"
      aria-label="Buscar organizaciones"
      placeholder="Buscar por nombre o código…"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
