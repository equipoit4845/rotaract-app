"use client";

import { ChevronLeft, ChevronRight, Download, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { formatSize, type AttachmentView } from "@/lib/inbox";

export type PreviewKind = "image" | "pdf" | "text" | null;

/** What the viewer can show; anything else is just downloaded. */
export function previewKind(
  a: Pick<AttachmentView, "contentType" | "filename">,
): PreviewKind {
  const type = (a.contentType ?? "").toLowerCase();
  const name = a.filename.toLowerCase();
  if (type.startsWith("image/") && !type.includes("svg")) return "image";
  if (/\.(png|jpe?g|gif|webp|bmp|heic)$/.test(name)) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type.startsWith("text/plain") || /\.(txt|csv|log)$/.test(name))
    return "text";
  return null;
}

/** Short-lived link to an attachment (correo-api checks access first). */
export const attachmentUrl = (messageId: string, attachmentId: string) =>
  api<{ url: string }>(
    `/messages/${messageId}/attachments/${attachmentId}`,
  ).then((r) => r.url);

/**
 * Full-screen viewer for the attachments of one message (Mail0's attachment
 * dialog): images, PDFs and plain text, ← / → to move, Esc to close. The file
 * loads from its short-lived storage link, on another origin, so it cannot
 * reach this app. SVG is never previewed (it can carry scripts).
 */
export function AttachmentPreview({
  messageId,
  attachments,
  index,
  onIndex,
  onClose,
}: {
  messageId: string;
  attachments: AttachmentView[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const a = attachments[index];
  const kind = previewKind(a);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    attachmentUrl(messageId, a.id)
      .then((u) => !cancelled && setUrl(u))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setError(e instanceof Error ? e.message : "No se pudo abrir."),
      );
    return () => {
      cancelled = true;
    };
  }, [messageId, a.id]);

  // Captured on document: the inbox's own Esc / letter shortcuts never see these keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      else if (e.key === "ArrowRight" && index < attachments.length - 1)
        onIndex(index + 1);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [index, attachments.length, onClose, onIndex]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={a.filename}
      className="fixed inset-0 z-50 flex flex-col bg-black/85"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 px-4 text-white">
        <FileText className="size-5 shrink-0 opacity-70" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {a.filename}
          </span>
          <span className="block text-xs opacity-70">
            {formatSize(a.sizeBytes)}
            {attachments.length > 1
              ? ` · ${index + 1} de ${attachments.length}`
              : ""}
          </span>
        </span>
        <button
          type="button"
          onClick={() =>
            url && window.open(url, "_blank", "noopener,noreferrer")
          }
          disabled={!url}
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          <Download className="size-4" aria-hidden />
          Descargar
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar (Esc)"
          title="Cerrar (Esc)"
          className="rounded-full p-2 hover:bg-white/10"
        >
          <X className="size-5" />
        </button>
      </header>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4"
        onClick={onClose}
      >
        {index > 0 ? (
          <NavButton side="left" onClick={() => onIndex(index - 1)} />
        ) : null}
        <div
          className="flex w-full max-w-5xl items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {error ? (
            <p className="rounded-lg bg-white/10 px-4 py-3 text-sm text-white">
              {error}
            </p>
          ) : !url ? (
            <p className="text-sm text-white/70">Cargando…</p>
          ) : kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={a.filename}
              referrerPolicy="no-referrer"
              className="max-h-[calc(100dvh-6rem)] max-w-full rounded object-contain shadow-2xl"
            />
          ) : kind === "pdf" || kind === "text" ? (
            <iframe
              src={url}
              title={a.filename}
              referrerPolicy="no-referrer"
              className="h-[calc(100dvh-6rem)] w-full rounded bg-white shadow-2xl"
              {...(kind === "text" ? { sandbox: "" } : {})}
            />
          ) : (
            <div className="rounded-xl bg-white/10 px-6 py-5 text-center text-sm text-white">
              <p className="mb-3">Este tipo de archivo no se puede ver acá.</p>
              <button
                type="button"
                onClick={() =>
                  window.open(url, "_blank", "noopener,noreferrer")
                }
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 font-medium text-black"
              >
                <Download className="size-4" aria-hidden />
                Descargar
              </button>
            </div>
          )}
        </div>
        {index < attachments.length - 1 ? (
          <NavButton side="right" onClick={() => onIndex(index + 1)} />
        ) : null}
      </div>
    </div>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={
        side === "left" ? "Adjunto anterior (←)" : "Adjunto siguiente (→)"
      }
      className={`absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 ${side === "left" ? "left-4" : "right-4"}`}
    >
      <Icon className="size-6" />
    </button>
  );
}
