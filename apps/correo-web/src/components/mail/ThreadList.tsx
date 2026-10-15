"use client";

import {
  Archive,
  ArchiveRestore,
  Mail,
  MailOpen,
  OctagonAlert,
  Paperclip,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  formatListDate,
  senderLabel,
  type ThreadSummary,
  type View,
} from "@/lib/inbox";
import {
  MOVE_LABEL,
  primaryMove,
  type ThreadAction,
} from "@/lib/thread-actions";
import { cn } from "@/lib/utils";

const EMPTY: Record<View, string> = {
  INBOX: "Recibidos está al día. No queda nada por leer.",
  SENT: "Todavía no enviaste ningún mail desde esta casilla.",
  ARCHIVE: "No hay conversaciones archivadas.",
  SPAM: "No hay nada en Spam.",
  TRASH: "La papelera está vacía. Lo que llega acá se borra a los 30 días.",
  DRAFTS: "No tenés borradores.",
};

/**
 * The conversations of one view. A row: initial, sender (recipients in
 * Sent), count, date, subject, first line, attachment clip; unread in bold
 * with a dot. Hover shows the main move and delete; checkboxes select rows
 * for the toolbar. A read-only mailbox can only mark read or unread.
 */
export function ThreadList({
  view,
  label,
  threads,
  loading,
  error,
  hasMore,
  loadingMore,
  onLoadMore,
  selected,
  onToggle,
  onToggleAll,
  openId,
  onOpen,
  onAction,
  readOnly,
}: {
  view: View;
  label: string;
  threads: ThreadSummary[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  openId: string | null;
  onOpen: (id: string) => void;
  onAction: (ids: string[], action: ThreadAction) => void;
  readOnly: boolean;
}) {
  const main = primaryMove(view);
  const ids = [...selected];
  const allSelected = threads.length > 0 && selected.size === threads.length;

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={label}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <input
          type="checkbox"
          aria-label="Seleccionar todas"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = selected.size > 0 && !allSelected;
          }}
          onChange={onToggleAll}
          disabled={!threads.length}
          className="size-4 accent-primary"
        />
        {selected.size ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className="mr-1 text-sm text-muted-foreground">
              {selected.size}
            </span>
            {!readOnly ? (
              <>
                <ToolbarButton
                  label={MOVE_LABEL[main].button}
                  onClick={() => onAction(ids, { kind: "move", folder: main })}
                >
                  {main === "ARCHIVE" ? <Archive /> : <ArchiveRestore />}
                </ToolbarButton>
                {view !== "TRASH" ? (
                  <ToolbarButton
                    label="Borrar"
                    onClick={() =>
                      onAction(ids, { kind: "move", folder: "TRASH" })
                    }
                  >
                    <Trash2 />
                  </ToolbarButton>
                ) : null}
                {view === "INBOX" ? (
                  <ToolbarButton
                    label="Es spam"
                    onClick={() =>
                      onAction(ids, { kind: "move", folder: "SPAM" })
                    }
                  >
                    <OctagonAlert />
                  </ToolbarButton>
                ) : null}
              </>
            ) : null}
            <ToolbarButton
              label="Marcar como leídas"
              onClick={() => onAction(ids, { kind: "read", read: true })}
            >
              <MailOpen />
            </ToolbarButton>
            <ToolbarButton
              label="Marcar como no leídas"
              onClick={() => onAction(ids, { kind: "read", read: false })}
            >
              <Mail />
            </ToolbarButton>
          </div>
        ) : (
          <h2 className="flex-1 truncate text-sm font-semibold text-foreground">
            {label}
          </h2>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <p className="m-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : !threads.length ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {EMPTY[view]}
          </p>
        ) : (
          <ul role="listbox" aria-label={label}>
            {threads.map((t) => (
              <Row
                key={t.id}
                thread={t}
                view={view}
                selected={selected.has(t.id)}
                anySelected={selected.size > 0}
                open={t.id === openId}
                onToggle={() => onToggle(t.id)}
                onOpen={() => onOpen(t.id)}
                onAction={(action) => onAction([t.id], action)}
                readOnly={readOnly}
              />
            ))}
          </ul>
        )}
        {hasMore && !loading ? (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="m-3 w-[calc(100%-1.5rem)] rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
          >
            {loadingMore ? "Cargando…" : "Ver más"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function Row({
  thread: t,
  view,
  selected,
  anySelected,
  open,
  onToggle,
  onOpen,
  onAction,
  readOnly,
}: {
  thread: ThreadSummary;
  view: View;
  selected: boolean;
  anySelected: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAction: (action: ThreadAction) => void;
  readOnly: boolean;
}) {
  const main = primaryMove(view);
  const who =
    view === "SENT" || !t.lastFrom
      ? `Para: ${t.to.join(", ") || "—"}`
      : senderLabel(t.lastFrom);
  const initial = (who.replace(/^Para: /, "").trim()[0] ?? "?").toUpperCase();

  return (
    <li
      role="option"
      aria-selected={open}
      className={cn(
        "group relative flex cursor-pointer gap-3 border-b px-3 py-2.5",
        open
          ? "bg-primary/5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary"
          : selected
            ? "bg-primary/10"
            : "hover:bg-muted/50",
      )}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) onToggle();
        else onOpen();
      }}
    >
      <span className="relative mt-0.5 size-8 shrink-0">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground",
            (selected || anySelected) && "invisible",
            "group-hover:invisible",
          )}
          aria-hidden
        >
          {initial}
        </span>
        <input
          type="checkbox"
          aria-label="Seleccionar"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          className={cn(
            "absolute inset-0 m-auto size-4 accent-primary",
            selected || anySelected
              ? "visible"
              : "invisible group-hover:visible",
          )}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {t.unread ? (
            <span
              className="size-2 shrink-0 self-center rounded-full bg-primary"
              aria-label="No leída"
            />
          ) : null}
          <span
            className={cn(
              "truncate text-sm",
              t.unread ? "font-semibold text-foreground" : "text-foreground/80",
            )}
          >
            {who}
          </span>
          {t.messageCount > 1 ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {t.messageCount}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground group-hover:invisible">
            {formatListDate(t.lastMessageAt)}
          </span>
        </div>
        <p
          className={cn(
            "truncate text-sm",
            t.unread ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {t.subject}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          {t.hasAttachments ? (
            <Paperclip
              className="size-3 shrink-0"
              aria-label="Tiene adjuntos"
            />
          ) : null}
          <span className="truncate">{t.snippet}</span>
        </p>
      </div>

      {!readOnly ? (
        <span className="absolute right-2 top-2 hidden items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-sm group-hover:flex">
          <HoverButton
            label={MOVE_LABEL[main].button}
            onClick={() => onAction({ kind: "move", folder: main })}
          >
            {main === "ARCHIVE" ? <Archive /> : <ArchiveRestore />}
          </HoverButton>
          {view !== "TRASH" ? (
            <HoverButton
              label="Borrar"
              onClick={() => onAction({ kind: "move", folder: "TRASH" })}
            >
              <Trash2 />
            </HoverButton>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

function HoverButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
