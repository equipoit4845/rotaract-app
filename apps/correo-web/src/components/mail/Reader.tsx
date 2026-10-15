"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Download,
  Mail,
  OctagonAlert,
  Reply,
  ReplyAll,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { notifyInboxChanged } from "@/components/mail/ComposeProvider";
import { Composer } from "@/components/mail/Composer";
import { HtmlFrame } from "@/components/mail/HtmlFrame";
import { api } from "@/lib/api";
import {
  formatDateTime,
  formatSize,
  senderLabel,
  type AttachmentView,
  type MessageView,
  type ThreadView,
  type View,
} from "@/lib/inbox";
import {
  MOVE_LABEL,
  primaryMove,
  type ThreadAction,
} from "@/lib/thread-actions";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; tone: string }> = {
  QUEUED: { label: "En cola", tone: "text-muted-foreground" },
  SENT: { label: "Enviado", tone: "text-muted-foreground" },
  DELIVERED: { label: "Entregado", tone: "text-success" },
  BOUNCED: { label: "Rebotó: revisá la dirección", tone: "text-destructive" },
  FAILED: { label: "No se pudo enviar", tone: "text-destructive" },
};

/**
 * One conversation: toolbar, messages stacked with only the newest one open,
 * the inline reply. Opening it marks it read (correo-api does).
 */
export function Reader({
  threadId,
  view,
  readOnly,
  onClose,
  onAction,
  onOpened,
  replyRequest,
  ownAddresses,
}: {
  threadId: string;
  view: View;
  readOnly: boolean;
  onClose: () => void;
  onAction: (action: ThreadAction) => void;
  onOpened: () => void;
  /** Bumped by the r / a shortcuts to open the reply box. */
  replyRequest?: { n: number; replyAll: boolean } | null;
  /** The person's own addresses: never copied on a reply. */
  ownAddresses: string[];
}) {
  const { state, reload } = useApi<ThreadView>(`/threads/${threadId}`);
  const [replying, setReplying] = useState<null | { replyAll: boolean }>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setReplying(null);
    setExpanded(new Set());
  }, [threadId]);
  useEffect(() => {
    if (state.kind !== "ready") return;
    onOpened();
    // An unsent reply left here comes back open.
    if (state.data.draft && !readOnly)
      setReplying({ replyAll: state.data.draft.replyAll });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, threadId]);
  useEffect(() => {
    if (replyRequest && !readOnly)
      setReplying({ replyAll: replyRequest.replyAll });
  }, [replyRequest, readOnly]);

  if (state.kind === "loading")
    return <p className="p-6 text-sm text-muted-foreground">Cargando…</p>;
  if (state.kind === "error")
    return (
      <p className="m-6 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {state.message}
      </p>
    );

  const thread = state.data;
  const last = thread.messages[thread.messages.length - 1];
  const main = primaryMove(view);
  const others = last ? [...last.to, ...last.cc].length > 1 : false;

  return (
    <article
      className="flex h-full min-h-0 flex-col"
      aria-label={thread.subject}
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <IconButton
          label="Volver a la lista"
          onClick={onClose}
          className="lg:hidden"
        >
          <ArrowLeft />
        </IconButton>
        {!readOnly ? (
          <>
            <IconButton
              label={MOVE_LABEL[main].button}
              onClick={() => onAction({ kind: "move", folder: main })}
            >
              {main === "ARCHIVE" ? <Archive /> : <ArchiveRestore />}
            </IconButton>
            {view !== "TRASH" ? (
              <IconButton
                label="Borrar"
                onClick={() => onAction({ kind: "move", folder: "TRASH" })}
              >
                <Trash2 />
              </IconButton>
            ) : null}
            {view === "INBOX" ? (
              <IconButton
                label="Es spam"
                onClick={() => onAction({ kind: "move", folder: "SPAM" })}
              >
                <OctagonAlert />
              </IconButton>
            ) : null}
          </>
        ) : null}
        <IconButton
          label="Marcar como no leída"
          onClick={() => onAction({ kind: "read", read: false })}
        >
          <Mail />
        </IconButton>
        {!readOnly && last ? (
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setReplying({ replyAll: false })}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              <Reply className="size-4" aria-hidden />
              <span className="hidden sm:inline">Responder</span>
            </button>
            {others ? (
              <button
                onClick={() => setReplying({ replyAll: true })}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-foreground hover:bg-muted"
              >
                <ReplyAll className="size-4" aria-hidden />
                <span className="hidden sm:inline">A todos</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <h1 className="mb-4 text-xl font-semibold tracking-tight text-foreground">
          {thread.subject}
        </h1>
        <ol className="space-y-2">
          {thread.messages.map((m, i) => {
            const isOpen =
              i === thread.messages.length - 1 || expanded.has(m.id);
            return (
              <li key={m.id}>
                {isOpen ? (
                  <MessageCard message={m} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setExpanded(new Set([...expanded, m.id]))}
                    className="flex w-full items-baseline gap-2 rounded-xl border px-4 py-2.5 text-left hover:bg-muted/50"
                  >
                    <span className="shrink-0 text-sm font-medium text-foreground">
                      {senderLabel(m.from)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {m.body.replace(/\s+/g, " ").slice(0, 160)}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(m.at)}
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        {readOnly ? (
          <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
            Esta casilla está en solo lectura: podés leer y descargar, pero ya
            no responder.
          </p>
        ) : replying && last ? (
          <div className="mt-4 rounded-xl border shadow-sm">
            <Composer
              key={threadId}
              autoFocus
              mode={{
                kind: "reply",
                mailboxId: thread.mailboxId,
                threadId,
                replyAll: thread.draft?.replyAll ?? replying.replyAll,
                recipients: recipientsOf(last, ownAddresses),
                draft: thread.draft ?? undefined,
              }}
              onSent={() => {
                setReplying(null);
                reload();
                notifyInboxChanged();
              }}
              onClose={() => {
                setReplying(null);
                reload();
              }}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Who a reply goes to, as ClickMail will address it: Reply-To (or From) for
 * Responder; Responder a todos adds the other To/Cc, never our own addresses.
 * Following up on our own email: the same recipients.
 */
function recipientsOf(last: MessageView, own: string[]) {
  const ours = new Set(own);
  if (last.direction === "IN") {
    const to = last.replyTo.length ? last.replyTo : [last.from.email];
    const others = [...new Set([...last.to, ...last.cc])].filter(
      (e) => !ours.has(e) && !to.includes(e),
    );
    return { to, others };
  }
  return {
    to: last.to.filter((e) => !ours.has(e)),
    others: last.cc.filter((e) => !ours.has(e)),
  };
}

function MessageCard({ message: m }: { message: MessageView }) {
  return (
    <section className="rounded-xl border p-4">
      <header className="mb-3 space-y-0.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {senderLabel(m.from)}
          </span>
          {m.from.name ? (
            <span className="truncate text-xs text-muted-foreground">
              {m.from.email}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {formatDateTime(m.at)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          Para: {m.to.join(", ")}
          {m.cc.length ? ` · CC: ${m.cc.join(", ")}` : ""}
          {m.bcc.length ? ` · CCO: ${m.bcc.join(", ")}` : ""}
        </p>
        {m.direction === "OUT" && STATUS[m.status] ? (
          <p className={cn("text-xs", STATUS[m.status].tone)}>
            {STATUS[m.status].label}
          </p>
        ) : null}
      </header>
      {m.suspicious ? (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          No pudimos confirmar que este mail venga de {m.from.email}. No abras
          enlaces ni adjuntos si no lo esperabas.
        </p>
      ) : null}
      {m.html && m.direction === "IN" ? (
        <HtmlFrame html={m.html} remoteImages={m.remoteImages} />
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {m.body || <span className="text-muted-foreground">(sin texto)</span>}
        </div>
      )}
      {m.attachments.length ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {m.attachments.map((a) => (
            <li key={a.id}>
              <AttachmentButton
                messageId={m.id}
                attachment={a}
                outgoing={m.direction === "OUT"}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AttachmentButton({
  messageId,
  attachment: a,
  outgoing,
}: {
  messageId: string;
  attachment: AttachmentView;
  outgoing: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>(
        `/messages/${messageId}/attachments/${a.id}`,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button
        onClick={open}
        disabled={!a.available || busy}
        title={
          a.available
            ? "Descargar"
            : outgoing
              ? "Enviado con el mail; no se puede descargar desde acá"
              : "Este adjunto no se guardó (superaba el tamaño)"
        }
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs text-foreground hover:bg-muted disabled:opacity-60"
      >
        <Download className="size-3.5" aria-hidden />
        <span className="max-w-48 truncate">{a.filename}</span>
        <span className="text-muted-foreground">{formatSize(a.sizeBytes)}</span>
      </button>
      {error ? (
        <span className="mt-1 text-xs text-destructive">{error}</span>
      ) : null}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4",
        className,
      )}
    >
      {children}
    </button>
  );
}
