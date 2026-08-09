"use client";

import { Input } from "@equipoit4845/ui";
import { useEffect, useState } from "react";

/**
 * Local, debounced draft so typing doesn't push a new URL (and a new
 * `usePersons` request) on every keystroke — only after the person pauses.
 * Same pattern as `OrganizationSearchInput`, deliberately not shared
 * cross-feature (product spec §29 for this phase).
 */
export function PersonSearchInput({
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

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (draft !== (value ?? "")) onCommit(draft);
    }, 350);
    return () => clearTimeout(timeout);
  }, [draft]);

  return (
    <Input
      type="search"
      aria-label="Buscar personas"
      placeholder="Buscar por nombre, email…"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
