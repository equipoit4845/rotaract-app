/** Shapes of correo-api's reading endpoints (src/inbox/inbox.controller.ts). */

export type Folder = "INBOX" | "ARCHIVE" | "TRASH" | "SPAM";
/** What the list shows: a stored folder, Sent (conversations we wrote in) or Drafts. */
export type View = Folder | "SENT" | "DRAFTS";

/** URL slug ↔ view: /bandeja/:mailboxId/:carpeta */
export const VIEWS: Array<{
  slug: string;
  view: View;
  label: string;
  more?: boolean;
}> = [
  { slug: "recibidos", view: "INBOX", label: "Recibidos" },
  { slug: "enviados", view: "SENT", label: "Enviados" },
  { slug: "borradores", view: "DRAFTS", label: "Borradores" },
  { slug: "archivo", view: "ARCHIVE", label: "Archivo" },
  { slug: "spam", view: "SPAM", label: "Spam", more: true },
  { slug: "papelera", view: "TRASH", label: "Papelera", more: true },
];
export const viewOfSlug = (slug: string) => VIEWS.find((v) => v.slug === slug);
export const slugOfView = (view: View) =>
  VIEWS.find((v) => v.view === view)!.slug;

export type ThreadSummary = {
  id: string;
  subject: string;
  snippet: string;
  unread: boolean;
  lastMessageAt: string;
  messageCount: number;
  from: { email: string; name: string | null } | null;
  to: string[];
  lastDirection: "IN" | "OUT" | null;
  /** Newest sender from outside; null when we only wrote. */
  lastFrom: { email: string; name: string | null } | null;
  folder: Folder;
  hasAttachments: boolean;
};

export type ThreadPage = { items: ThreadSummary[]; nextBefore: string | null };

export type AttachmentView = {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number;
  available: boolean;
};

export type MessageView = {
  id: string;
  direction: "IN" | "OUT";
  from: { email: string; name: string | null };
  to: string[];
  cc: string[];
  replyTo: string[];
  subject: string;
  body: string;
  /** Sanitized by correo-api; shown in a sandboxed iframe. */
  html: string | null;
  remoteImages: boolean;
  at: string;
  status: string;
  statusDetail: string | null;
  bcc: string[];
  suspicious: boolean;
  spam: boolean;
  attachments: AttachmentView[];
};

export type DraftView = {
  id: string;
  threadId: string | null;
  replyAll: boolean;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  updatedAt: string;
};

export type ThreadView = {
  id: string;
  mailboxId: string;
  subject: string;
  folder: Folder;
  /** The person's unsent reply in this thread. */
  draft: Pick<DraftView, "id" | "replyAll" | "cc" | "bcc" | "text"> | null;
  messages: MessageView[];
};

const dateTime = new Intl.DateTimeFormat("es-PY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Asuncion",
});
const timeOnly = new Intl.DateTimeFormat("es-PY", {
  timeStyle: "short",
  timeZone: "America/Asuncion",
});
const dayOnly = new Intl.DateTimeFormat("es-PY", {
  day: "numeric",
  month: "short",
  timeZone: "America/Asuncion",
});

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** Today → "14:32"; otherwise "15 oct." (Asunción time). */
export function formatListDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return dayOnly.format(d) === dayOnly.format(now)
    ? timeOnly.format(d)
    : dayOnly.format(d);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const senderLabel = (from: { email: string; name: string | null }) =>
  from.name?.trim() || from.email;

/** Quick views over Recibidos (Inbox Zero "splits", fixed rules, no AI). */
export const QUICK_VIEWS: Array<{ slug: string | null; label: string }> = [
  { slug: null, label: "Todas" },
  { slug: "no-leidos", label: "No leídas" },
  { slug: "por-responder", label: "Por responder" },
  { slug: "con-adjuntos", label: "Con adjuntos" },
];
