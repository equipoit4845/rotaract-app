"use client";

import { toast } from "sonner";

import { api } from "@/lib/api";
import type { Folder, View } from "@/lib/inbox";

type Previous = { id: string; folder: Folder; read: boolean };

export type ThreadAction =
  { kind: "move"; folder: Folder } | { kind: "read"; read: boolean };

/** What each move is called in the list's toolbar and in the toast. */
export const MOVE_LABEL: Record<Folder, { button: string; done: string }> = {
  ARCHIVE: { button: "Archivar", done: "Archivada" },
  TRASH: { button: "Borrar", done: "Enviada a la papelera" },
  SPAM: { button: "Es spam", done: "Movida a Spam" },
  INBOX: { button: "Mover a Recibidos", done: "Movida a Recibidos" },
};

/** The main way out of each view (Inbox Zero: archive first). */
export function primaryMove(view: View): Folder {
  if (view === "ARCHIVE" || view === "SPAM" || view === "TRASH") return "INBOX";
  return "ARCHIVE";
}

/** After a move, does the conversation still belong in this view? */
export function staysIn(view: View, folder: Folder): boolean {
  return view === "SENT" ? folder !== "TRASH" : view === folder;
}

/**
 * Runs an action on conversations and offers "Deshacer" for 8 s. The toast
 * shows at once (the list already changed); undo waits for the request and
 * puts back each conversation's folder and read state as they were.
 */
export async function runThreadAction(
  ids: string[],
  action: ThreadAction,
  onUndone?: () => void,
): Promise<boolean> {
  const request = api<{ previous: Previous[] }>("/threads/actions", {
    method: "POST",
    body: JSON.stringify({
      threadIds: ids,
      ...(action.kind === "move"
        ? { folder: action.folder }
        : { read: action.read }),
    }),
  });
  const n = ids.length;
  const message =
    action.kind === "move"
      ? `${MOVE_LABEL[action.folder].done}${n > 1 ? ` (${n})` : ""}`
      : action.read
        ? `Marcada${n > 1 ? `s (${n})` : ""} como leída${n > 1 ? "s" : ""}`
        : `Marcada${n > 1 ? `s (${n})` : ""} como no leída${n > 1 ? "s" : ""}`;
  const id = toast(message, {
    duration: 8000,
    action: {
      label: "Deshacer",
      onClick: () =>
        void request
          .then(({ previous }) => undo(previous, action))
          .then(onUndone)
          .catch(() => undefined),
    },
  });
  try {
    await request;
    return true;
  } catch (e) {
    toast.dismiss(id);
    toast.error(e instanceof Error ? e.message : "No se pudo hacer el cambio.");
    return false;
  }
}

async function undo(previous: Previous[], action: ThreadAction) {
  const groups = new Map<string, string[]>();
  for (const p of previous) {
    const key =
      action.kind === "move" ? `folder:${p.folder}` : `read:${p.read}`;
    groups.set(key, [...(groups.get(key) ?? []), p.id]);
  }
  try {
    for (const [key, ids] of groups) {
      const [kind, value] = key.split(":");
      await api("/threads/actions", {
        method: "POST",
        body: JSON.stringify({
          threadIds: ids,
          ...(kind === "folder"
            ? { folder: value }
            : { read: value === "true" }),
        }),
      });
    }
    toast.success("Listo, quedó como estaba.");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo deshacer.");
  }
}
