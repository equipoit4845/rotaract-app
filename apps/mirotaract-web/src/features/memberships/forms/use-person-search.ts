"use client";

import { usePersons } from "@/lib/api";
import type { Person } from "@/lib/api";
import { useEffect, useState } from "react";

/**
 * Debounced, server-filtered search — never "list all persons and filter
 * client-side" (`PersonFilters.query` is a real Kernel filter,
 * kernel-openapi.yaml `/persons`). Only the first page is read, bounded by
 * `limit: 20`: a picker needs "narrow the search enough to find one
 * person," not exhaustive pagination through every match. With an empty
 * draft this still issues one bounded request (first 20 persons, most
 * recently relevant order the Kernel decides) so the picker isn't empty
 * the instant it opens — never one request per keystroke, the debounce
 * still applies to every value including the empty string.
 */
export function usePersonSearch(): {
  draft: string;
  setDraft: (value: string) => void;
  results: Person[];
  isLoading: boolean;
} {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(draft), 350);
    return () => clearTimeout(timeout);
  }, [draft]);

  const search = usePersons({ query: query || undefined, limit: 20 });
  const results = search.data?.pages[0]?.items ?? [];

  return { draft, setDraft, results, isLoading: search.isLoading };
}
