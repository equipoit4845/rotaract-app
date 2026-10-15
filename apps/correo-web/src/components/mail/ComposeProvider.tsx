"use client";

import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { Composer } from "@/components/mail/Composer";
import type { DraftView } from "@/lib/inbox";
import { cn } from "@/lib/utils";

/** Fired after something changed the inbox (sent, draft saved or discarded). */
export const INBOX_CHANGED = "correo:changed";
export const notifyInboxChanged = () =>
  window.dispatchEvent(new Event(INBOX_CHANGED));

type Open = { mailboxId: string; draft?: DraftView; key: number };
type ComposeApi = {
  openCompose: (mailboxId: string, draft?: DraftView) => void;
};

const ComposeContext = createContext<ComposeApi>({
  openCompose: () => undefined,
});
export const useCompose = () => useContext(ComposeContext);

type Size = "normal" | "minimized" | "maximized";

/**
 * The "Nuevo mensaje" window, like Gmail's: docked bottom-right over the
 * inbox, which stays usable behind it; minimize to its title bar, maximize
 * to a large centered window, ✕ closes keeping the draft. Full screen on a
 * phone. It lives in the mailbox layout, so changing folders keeps it open.
 */
export function ComposeProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [size, setSize] = useState<Size>("normal");
  const [title, setTitle] = useState("Nuevo mensaje");
  const [hidden, setHidden] = useState(false);
  const [closeSignal, setCloseSignal] = useState(0);

  const openCompose = useCallback((mailboxId: string, draft?: DraftView) => {
    setSize("normal");
    setOpen((current) => {
      // "Redactar" again brings back the open window instead of replacing it
      // (its unsaved text would be lost); a draft or another mailbox replaces it.
      if (current && !draft && current.mailboxId === mailboxId) return current;
      setHidden(false);
      setTitle(draft?.subject || "Nuevo mensaje");
      return { mailboxId, draft, key: Date.now() };
    });
  }, []);

  const iconButton =
    "rounded p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground";

  return (
    <ComposeContext.Provider value={{ openCompose }}>
      {children}
      {open ? (
        <>
          {size === "maximized" && !hidden ? (
            <div
              className="fixed inset-0 z-30 hidden bg-black/40 sm:block"
              onClick={() => setSize("normal")}
            />
          ) : null}
          <section
            aria-label={title}
            className={cn(
              "fixed z-40 flex flex-col overflow-hidden border bg-background shadow-2xl",
              hidden && "hidden",
              size === "minimized"
                ? "bottom-0 right-4 w-72 rounded-t-xl"
                : size === "maximized"
                  ? "inset-0 sm:inset-x-[8vw] sm:inset-y-[6vh] sm:rounded-xl"
                  : "inset-0 sm:inset-auto sm:bottom-0 sm:right-4 sm:h-[34rem] sm:max-h-[85vh] sm:w-[36rem] sm:rounded-t-xl",
            )}
          >
            <header
              className="flex h-10 shrink-0 cursor-default items-center gap-1 bg-muted px-3"
              onClick={() => size === "minimized" && setSize("normal")}
            >
              <span className="flex-1 truncate text-sm font-medium text-foreground">
                {title}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSize(size === "minimized" ? "normal" : "minimized");
                }}
                aria-label={size === "minimized" ? "Abrir" : "Minimizar"}
                title={size === "minimized" ? "Abrir" : "Minimizar"}
                className={cn(iconButton, "hidden sm:block")}
              >
                <Minus className="size-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSize(size === "maximized" ? "normal" : "maximized");
                }}
                aria-label={size === "maximized" ? "Achicar" : "Agrandar"}
                title={size === "maximized" ? "Achicar" : "Agrandar"}
                className={cn(iconButton, "hidden sm:block")}
              >
                {size === "maximized" ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCloseSignal((n) => n + 1);
                }}
                aria-label="Cerrar (se guarda el borrador)"
                title="Cerrar (se guarda el borrador)"
                className={iconButton}
              >
                <X className="size-4" />
              </button>
            </header>
            <Composer
              key={open.key}
              autoFocus
              className={cn("flex-1", size === "minimized" && "hidden")}
              closeSignal={closeSignal}
              onHiddenChange={setHidden}
              onSubjectChange={(s) => setTitle(s.trim() || "Nuevo mensaje")}
              mode={{
                kind: "new",
                mailboxId: open.mailboxId,
                draft: open.draft,
              }}
              onSent={() => {
                setOpen(null);
                notifyInboxChanged();
              }}
              onClose={() => {
                setOpen(null);
                notifyInboxChanged();
              }}
            />
          </section>
        </>
      ) : null}
    </ComposeContext.Provider>
  );
}
