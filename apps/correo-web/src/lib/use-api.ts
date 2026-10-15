"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";

/** Last answer per path: a remounted screen (another folder) shows it at once. */
const cache = new Map<string, unknown>();

export type Loadable<T> =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: T };

/**
 * GET `path` from correo-api on mount and on `reload()`. What was already
 * shown (or cached from an earlier screen) stays until the new answer
 * arrives: no "Cargando…" flash when switching folders.
 */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<Loadable<T>>(() =>
    path && cache.has(path)
      ? { kind: "ready", data: cache.get(path) as T }
      : { kind: "loading" },
  );
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setState((s) => (s.kind === "ready" ? s : { kind: "loading" }));
    api<T>(path)
      .then((data) => {
        cache.set(path, data);
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch(
        (error: unknown) =>
          !cancelled &&
          setState({
            kind: "error",
            message:
              error instanceof Error
                ? error.message
                : "Algo salió mal. Probá de nuevo.",
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}
