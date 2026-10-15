"use client";

import { Paperclip, Reply, ReplyAll, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { isEmail, RecipientInput } from "@/components/mail/RecipientInput";
import { api } from "@/lib/api";
import { formatSize, type DraftView } from "@/lib/inbox";
import { cn } from "@/lib/utils";

/** Same limits correo-api enforces (src/outbound/outbound.service.ts). */
const MAX_FILES = 10;
const MAX_BYTES = 25 * 1024 * 1024;
const BLOCKED =
  /\.(exe|bat|cmd|com|scr|js|jse|vbs|vbe|ps1|msi|jar|lnk|reg|hta|pif|cpl|wsf)$/i;
/** Seconds to change one's mind after "Enviar" (Gmail's default). */
const UNDO_MS = 5000;
const AUTOSAVE_MS = 3000;

export type ComposerMode =
  | { kind: "new"; mailboxId: string; draft?: DraftView }
  | {
      kind: "reply";
      mailboxId: string;
      threadId: string;
      replyAll: boolean;
      /** Who it goes to: `to` for Responder, plus `others` for Responder a todos. */
      recipients: { to: string[]; others: string[] };
      draft?: Pick<DraftView, "id" | "cc" | "bcc" | "text">;
    };

export const newKey = () =>
  (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  ).replace(/[^A-Za-z0-9_-]/g, "");

type Phase = "editing" | "confirm-attachment" | "pending" | "sending";

/**
 * Writing a new email or a reply, laid out like Gmail / Mail0: borderless
 * rows (Para with CC · CCO toggles, Asunto), the body, and a footer with
 * Enviar, attach and discard.
 *
 * - The draft (recipients and text; attachments stay here until sending) is
 *   saved 3 s after the last keystroke, under an id made once per draft.
 * - "Enviar" hides the composer and shows "Enviando… Deshacer" for 5 s;
 *   Deshacer brings it back exactly as it was, attachments included.
 * - The idempotency key is the draft id plus the attempt: a retried request
 *   never sends twice, a corrected one after an error is a new email.
 * - If the text mentions an attachment and there is none, it asks first.
 */
export function Composer({
  mode,
  onSent,
  onClose,
  onHiddenChange,
  closeSignal,
  onSubjectChange,
  autoFocus,
  className,
}: {
  mode: ComposerMode;
  onSent: (result: { threadId: string; messageId: string }) => void;
  /** Closed without sending (the draft stays unless discarded). */
  onClose?: () => void;
  /** The composer hides while a send can still be undone. */
  onHiddenChange?: (hidden: boolean) => void;
  /** Bumped by the parent (the window's ✕) to close, saving the draft. */
  closeSignal?: number;
  /** The window's title follows the subject. */
  onSubjectChange?: (subject: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const initial = mode.draft;
  const draftId = useMemo(() => initial?.id ?? newKey(), [initial?.id]);
  const [to, setTo] = useState<string[]>(
    mode.kind === "new" ? (mode.draft?.to ?? []) : [],
  );
  const [cc, setCc] = useState<string[]>(initial?.cc ?? []);
  const [bcc, setBcc] = useState<string[]>(initial?.bcc ?? []);
  const [showCc, setShowCc] = useState(!!initial?.cc.length);
  const [showBcc, setShowBcc] = useState(!!initial?.bcc.length);
  const [replyAll, setReplyAll] = useState(
    mode.kind === "reply" ? mode.replyAll : false,
  );
  const [subject, setSubject] = useState(
    mode.kind === "new" ? (mode.draft?.subject ?? "") : "",
  );
  const [text, setText] = useState(initial?.text ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("editing");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">(
    initial ? "saved" : "idle",
  );
  const attempt = useRef(0);
  const dirty = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastId = useRef<string | number | null>(null);

  const total = files.reduce((sum, f) => sum + f.size, 0);
  const hidden = phase === "pending" || phase === "sending";

  useEffect(() => onHiddenChange?.(hidden), [hidden, onHiddenChange]);

  const saveDraft = async () => {
    if (!dirty.current) return;
    dirty.current = false;
    setSaved("saving");
    try {
      await api(`/drafts/${draftId}`, {
        method: "PUT",
        body: JSON.stringify({
          mailboxId: mode.mailboxId,
          threadId: mode.kind === "reply" ? mode.threadId : undefined,
          replyAll,
          to,
          cc,
          bcc,
          subject,
          text,
        }),
      });
      setSaved("saved");
    } catch {
      dirty.current = true;
      setSaved("idle");
    }
  };

  // Autosave: 3 s after the last change.
  useEffect(() => {
    if (hidden) return;
    const empty = !to.length && !cc.length && !bcc.length && !subject && !text;
    if (empty && !initial) return;
    dirty.current = true;
    const t = setTimeout(() => void saveDraft(), AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, text, replyAll]);

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files, ...Array.from(picked)];
    const blocked = next.find((f) => BLOCKED.test(f.name));
    if (blocked)
      return setError(`No se pueden enviar archivos como ${blocked.name}.`);
    if (next.length > MAX_FILES)
      return setError(`Podés adjuntar hasta ${MAX_FILES} archivos.`);
    if (next.reduce((s, f) => s + f.size, 0) > MAX_BYTES)
      return setError("Los adjuntos pasan de 25 MB en total.");
    setError(null);
    setFiles(next);
  };

  const validate = (): string | null => {
    const bad = [...to, ...cc, ...bcc].find((e) => !isEmail(e));
    if (bad) return `«${bad}» no es una dirección válida.`;
    if (mode.kind === "new" && !to.length)
      return "Agregá al menos un destinatario.";
    if (!text.trim()) return "El mensaje está vacío.";
    return null;
  };

  const deliver = async () => {
    setPhase("sending");
    try {
      const form = new FormData();
      const common = {
        cc,
        bcc,
        text,
        idempotencyKey: `${draftId}-${attempt.current}`,
      };
      form.append(
        "payload",
        JSON.stringify(
          mode.kind === "new"
            ? { ...common, to, subject }
            : { ...common, replyAll },
        ),
      );
      files.forEach((f) => form.append("attachments", f, f.name));
      const result = await api<{ threadId: string; messageId: string }>(
        mode.kind === "new"
          ? `/mailboxes/${mode.mailboxId}/messages`
          : `/threads/${mode.threadId}/reply`,
        { method: "POST", body: form },
      );
      void api(`/drafts/${draftId}`, { method: "DELETE" }).catch(
        () => undefined,
      );
      // A new toast: the "Enviando…" one carries the Deshacer action.
      if (toastId.current !== null) toast.dismiss(toastId.current);
      toast.success("Mensaje enviado");
      onSent(result);
    } catch (e) {
      attempt.current += 1;
      const message = e instanceof Error ? e.message : "No se pudo enviar.";
      if (toastId.current !== null) toast.dismiss(toastId.current);
      toast.error(message);
      setError(message);
      setPhase("editing");
    }
  };

  // Closed or navigated away during the 5 s: "Enviar" was pressed, so it goes.
  const deliverRef = useRef(deliver);
  deliverRef.current = deliver;
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void deliverRef.current();
      }
    },
    [],
  );

  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (toastId.current !== null) toast.dismiss(toastId.current);
    setPhase("editing");
  };

  const send = (skipAttachmentCheck = false) => {
    const problem = validate();
    if (problem) return setError(problem);
    setError(null);
    if (!skipAttachmentCheck && !files.length && /\badjunt[oaáe]/i.test(text))
      return setPhase("confirm-attachment");
    setPhase("pending");
    toastId.current = toast.loading("Enviando…", {
      duration: UNDO_MS + 30_000,
      action: { label: "Deshacer", onClick: undo },
    });
    timer.current = setTimeout(() => {
      timer.current = null;
      void deliver();
    }, UNDO_MS);
  };

  const discard = async () => {
    undo();
    await api(`/drafts/${draftId}`, { method: "DELETE" }).catch(
      () => undefined,
    );
    onClose?.();
  };

  const close = async () => {
    await saveDraft();
    onClose?.();
  };

  const closeRef = useRef(close);
  closeRef.current = close;
  const firstSignal = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal !== firstSignal.current) void closeRef.current();
  }, [closeSignal]);

  const toggle = (label: string, on: boolean, show: () => void) =>
    on ? null : (
      <button
        type="button"
        onClick={show}
        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        {label}
      </button>
    );

  const copies = (
    <>
      {toggle("CC", showCc, () => setShowCc(true))}
      {toggle("CCO", showBcc, () => setShowBcc(true))}
    </>
  );

  const replyTo =
    mode.kind === "reply"
      ? replyAll
        ? [...mode.recipients.to, ...mode.recipients.others]
        : mode.recipients.to
      : [];

  return (
    <div
      className={cn("flex min-h-0 flex-col", hidden && "hidden", className)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !hidden) {
          e.preventDefault();
          send();
        }
      }}
    >
      {mode.kind === "reply" ? (
        <div className="flex min-h-10 flex-wrap items-center gap-1 border-b px-3 py-1">
          <button
            type="button"
            onClick={() => setReplyAll(!replyAll)}
            disabled={!mode.recipients.others.length}
            title={
              mode.recipients.others.length
                ? replyAll
                  ? "Cambiar a Responder"
                  : "Cambiar a Responder a todos"
                : undefined
            }
            className="mr-1 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-muted disabled:hover:bg-transparent"
          >
            {replyAll ? (
              <ReplyAll className="size-4" aria-label="Responder a todos" />
            ) : (
              <Reply className="size-4" aria-label="Responder" />
            )}
          </button>
          {replyTo.map((email) => (
            <span
              key={email}
              className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              {email}
            </span>
          ))}
          <span className="ml-auto flex shrink-0 gap-2">{copies}</span>
        </div>
      ) : (
        <RecipientInput
          mailboxId={mode.mailboxId}
          label="Para"
          value={to}
          onChange={setTo}
          autoFocus={autoFocus}
          trailing={copies}
        />
      )}
      {showCc ? (
        <RecipientInput
          mailboxId={mode.mailboxId}
          label="CC"
          value={cc}
          onChange={setCc}
        />
      ) : null}
      {showBcc ? (
        <RecipientInput
          mailboxId={mode.mailboxId}
          label="CCO"
          value={bcc}
          onChange={setBcc}
        />
      ) : null}
      {mode.kind === "new" ? (
        <input
          className="border-b bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Asunto"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            onSubjectChange?.(e.target.value);
          }}
          aria-label="Asunto"
        />
      ) : null}
      <textarea
        className="min-h-48 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
        placeholder={
          mode.kind === "reply" ? "Escribí tu respuesta" : "Escribí tu mensaje"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Mensaje"
        autoFocus={mode.kind === "reply" && autoFocus}
      />

      {files.length ? (
        <ul className="flex flex-wrap gap-2 px-3 pb-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1 text-xs"
            >
              <Paperclip className="size-3 text-muted-foreground" aria-hidden />
              <span className="max-w-48 truncate">{f.name}</span>
              <span className="text-muted-foreground">
                {formatSize(f.size)}
              </span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                aria-label={`Quitar ${f.name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
          <li className="self-center text-xs text-muted-foreground">
            {formatSize(total)} de 25 MB
          </li>
        </ul>
      ) : null}

      {phase === "confirm-attachment" ? (
        <div className="mx-3 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <span>Mencionás un adjunto, pero no agregaste ninguno.</span>
          <button
            type="button"
            onClick={() => {
              setPhase("editing");
              fileInput.current?.click();
            }}
            className="font-medium text-primary hover:underline"
          >
            Adjuntar
          </button>
          <button
            type="button"
            onClick={() => send(true)}
            className="font-medium text-muted-foreground hover:underline"
          >
            Enviar igual
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="px-3 pb-2 text-sm text-destructive">{error}</p>
      ) : null}

      <footer className="flex items-center gap-1 border-t px-3 py-2">
        <button
          type="button"
          onClick={() => send()}
          title="Enviar (Ctrl/⌘ + Enter)"
          className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Enviar
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          title="Adjuntar archivos"
          aria-label="Adjuntar archivos"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Paperclip className="size-4" />
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="ml-auto px-2 text-xs text-muted-foreground">
          {saved === "saving"
            ? "Guardando…"
            : saved === "saved"
              ? "Borrador guardado"
              : ""}
        </span>
        <button
          type="button"
          onClick={() => void discard()}
          title="Descartar borrador"
          aria-label="Descartar borrador"
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </footer>
    </div>
  );
}
