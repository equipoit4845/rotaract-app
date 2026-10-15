"use client";

import { useEffect, useRef } from "react";

/**
 * The one list of keyboard shortcuts: the handler table and the "?" help
 * are both built from it, so they cannot drift apart (Inbox Zero's registry).
 */
export const SHORTCUTS = [
  { id: "compose", keys: ["c"], label: "Redactar" },
  { id: "search", keys: ["/"], label: "Buscar" },
  { id: "next", keys: ["j"], label: "Conversación siguiente" },
  { id: "prev", keys: ["k"], label: "Conversación anterior" },
  { id: "close", keys: ["Escape"], label: "Cerrar la conversación" },
  { id: "archive", keys: ["e"], label: "Archivar (o volver a Recibidos)" },
  { id: "trash", keys: ["#"], label: "Borrar" },
  { id: "unread", keys: ["u"], label: "Marcar como no leída" },
  { id: "reply", keys: ["r"], label: "Responder" },
  { id: "replyAll", keys: ["a"], label: "Responder a todos" },
  { id: "help", keys: ["?"], label: "Ver los atajos" },
] as const;

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

const typing = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
};

/**
 * Single-key shortcuts while not typing (Escape works everywhere but inputs
 * keep their own Escape). No modifiers, so Ctrl/⌘ combos stay the browser's.
 */
export function useShortcuts(
  handlers: Partial<Record<ShortcutId, () => void>>,
) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target)) return;
      const hit = SHORTCUTS.find((s) =>
        (s.keys as readonly string[]).includes(e.key),
      );
      const handler = hit && latest.current[hit.id];
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
