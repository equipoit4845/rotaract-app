"use client";

import {
  Archive,
  ChevronDown,
  FilePen,
  Inbox,
  Mail,
  OctagonAlert,
  PenLine,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { MailboxSummary } from "@/lib/api";
import { MIROTARACT_URL } from "@/lib/config";
import { VIEWS, type View } from "@/lib/inbox";
import { cn } from "@/lib/utils";

const ICON: Record<View, typeof Inbox> = {
  INBOX: Inbox,
  SENT: Send,
  ARCHIVE: Archive,
  SPAM: OctagonAlert,
  TRASH: Trash2,
  DRAFTS: FilePen,
};

/** Mailbox switcher, compose, folders (rarely used ones under «Más»). */
export function Sidebar({
  mailboxes,
  current,
  view,
  onNavigate,
  onCompose,
}: {
  mailboxes: MailboxSummary[];
  current: MailboxSummary;
  view: View;
  onNavigate?: () => void;
  onCompose: () => void;
}) {
  const [more, setMore] = useState(
    VIEWS.some((v) => v.more && v.view === view),
  );
  const item =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors";

  return (
    <nav
      className="flex h-full flex-col gap-4 p-3"
      aria-label="Casillas y carpetas"
    >
      <div className="space-y-1">
        <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Casillas
        </p>
        {mailboxes.map((m) => {
          const Icon = m.kind === "ROLE" ? Mail : UserRound;
          return (
            <Link
              key={m.id}
              href={`/bandeja/${m.id}/recibidos`}
              onClick={onNavigate}
              className={cn(
                item,
                m.id === current.id
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              title={m.address}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {m.address.split("@")[0]}
                <span className="text-muted-foreground">@</span>
              </span>
              {m.status === "READ_ONLY" ? (
                <span className="text-[10px] uppercase text-warning">
                  lectura
                </span>
              ) : m.unread ? (
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {m.unread}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {current.status === "ACTIVE" ? (
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            onCompose();
          }}
          title="Redactar (c)"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <PenLine className="size-4" aria-hidden />
          Redactar
        </button>
      ) : null}

      <div className="space-y-1">
        {VIEWS.filter((v) => !v.more || more).map((v) => {
          const Icon = ICON[v.view];
          return (
            <Link
              key={v.slug}
              href={`/bandeja/${current.id}/${v.slug}`}
              onClick={onNavigate}
              className={cn(
                item,
                v.view === view
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              aria-current={v.view === view ? "page" : undefined}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{v.label}</span>
              {v.view === "INBOX" && current.unread ? (
                <span className="text-xs font-semibold text-foreground">
                  {current.unread}
                </span>
              ) : null}
            </Link>
          );
        })}
        {!more ? (
          <button
            type="button"
            onClick={() => setMore(true)}
            className={cn(
              item,
              "w-full text-muted-foreground hover:bg-muted/60",
            )}
          >
            <ChevronDown className="size-4" aria-hidden />
            Más
          </button>
        ) : null}
      </div>

      <a
        href={MIROTARACT_URL}
        className="mt-auto px-3 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Volver a Mi Rotaract
      </a>
    </nav>
  );
}
