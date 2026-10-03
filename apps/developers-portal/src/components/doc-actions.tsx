"use client";

import { Bot, Check, Copy, FileText, MessageSquare } from "lucide-react";
import { useState } from "react";

/**
 * "Copiar como Markdown", the raw `.md`, and "Abrir en Claude / ChatGPT"
 * with a prefilled prompt pointing at this page's Markdown (E10.3).
 */
export function DocActions({
  slug,
  markdown,
  claudeUrl,
  chatGptUrl,
}: {
  slug: string;
  markdown: string;
  claudeUrl: string;
  chatGptUrl: string;
}) {
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
    setTimeout(() => setCopied("idle"), 2000);
  }

  const button =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted";

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Acciones de la página"
    >
      <button type="button" onClick={copy} className={button}>
        {copied === "ok" ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Copy className="size-3.5" aria-hidden />
        )}
        {copied === "ok"
          ? "Copiado"
          : copied === "error"
            ? "No se pudo copiar"
            : "Copiar como Markdown"}
      </button>
      <a href={`/docs/${slug}.md`} className={button}>
        <FileText className="size-3.5" aria-hidden />
        Ver .md
      </a>
      <a
        href={claudeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={button}
      >
        <Bot className="size-3.5" aria-hidden />
        Abrir en Claude
      </a>
      <a
        href={chatGptUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={button}
      >
        <MessageSquare className="size-3.5" aria-hidden />
        Abrir en ChatGPT
      </a>
    </div>
  );
}
