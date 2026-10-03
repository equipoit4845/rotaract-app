import { createHash } from "node:crypto";

import type { EmailMessage } from "../notifications/notification.service";

/**
 * E9.4 — changelog notices to the owners of active developer apps
 * (docs/16-developer-portal.md §Avisos). Entries live in
 * docs/developers/changelog.md, each introduced by an HTML comment
 * `<!-- entry: <id> -->` right before its `## ` heading:
 *
 *   <!-- entry: e9-portal -->
 *   ## 2026-10-04 · Portal de desarrolladores y registros (E9)
 *   **Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan
 */

export type ChangelogEntry = {
  id: string;
  title: string;
  /** Markdown body, without the heading. */
  body: string;
  breaking: boolean;
};

const ENTRY_MARKER = /^<!--\s*entry:\s*([a-z0-9][a-z0-9._-]*)\s*-->\s*$/i;

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const lines = markdown.split(/\r?\n/);
  const entries: ChangelogEntry[] = [];
  let current: { id: string; title?: string; body: string[] } | undefined;
  const close = () => {
    if (!current?.title) return;
    const body = current.body.join("\n").trim();
    entries.push({
      id: current.id,
      title: current.title,
      body,
      breaking: /\*\*Compatibilidad:\*\*\s*rompe/i.test(body),
    });
  };
  for (const line of lines) {
    const marker = line.match(ENTRY_MARKER);
    if (marker) {
      close();
      current = { id: marker[1], body: [] };
      continue;
    }
    if (!current) continue;
    if (!current.title) {
      const heading = line.match(/^##\s+(.+)$/);
      if (heading) current.title = heading[1].trim();
      continue;
    }
    // A new top-level section ends the entry (e.g. "## Cómo leer esto").
    if (/^#{1,2}\s/.test(line)) {
      close();
      current = undefined;
      continue;
    }
    current.body.push(line);
  }
  close();
  return entries;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain Markdown → small, safe HTML (paragraphs, bullets, bold, code, links). */
export function markdownToEmailHtml(markdown: string): string {
  const inline = (text: string) =>
    escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const blocks = markdown.split(/\n{2,}/).map((block) => block.trim());
  return blocks
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((line) => /^\s*[-*]\s+/.test(line)))
        return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      if (block.startsWith("```"))
        return `<pre>${escapeHtml(block.replace(/^```[^\n]*\n?|```$/g, ""))}</pre>`;
      return `<p>${inline(lines.join(" "))}</p>`;
    })
    .join("\n");
}

export type ChangelogRecipient = { email: string; apps: string[] };

export type NotifierStore = {
  developerApp: {
    findMany(args: {
      where: { status: "ACTIVE" };
      select: { name: true; ownerPersonId: true };
    }): Promise<Array<{ name: string; ownerPersonId: string }>>;
  };
  userAccount: {
    findMany(args: {
      where: { personId: { in: string[] }; status: "ACTIVE" };
      select: { personId: true; email: true };
    }): Promise<Array<{ personId: string; email: string }>>;
  };
};

/** One recipient per owner account (ACTIVE), with the names of their active apps. */
export async function changelogRecipients(
  store: NotifierStore,
): Promise<ChangelogRecipient[]> {
  const apps = await store.developerApp.findMany({
    where: { status: "ACTIVE" },
    select: { name: true, ownerPersonId: true },
  });
  const owners = [...new Set(apps.map((app) => app.ownerPersonId))];
  if (owners.length === 0) return [];
  const accounts = await store.userAccount.findMany({
    where: { personId: { in: owners }, status: "ACTIVE" },
    select: { personId: true, email: true },
  });
  const byEmail = new Map<string, Set<string>>();
  for (const account of accounts) {
    const email = account.email.trim().toLowerCase();
    const names = byEmail.get(email) ?? new Set<string>();
    for (const app of apps)
      if (app.ownerPersonId === account.personId) names.add(app.name);
    byEmail.set(email, names);
  }
  return [...byEmail.entries()]
    .map(([email, names]) => ({ email, apps: [...names].sort() }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export function changelogEmail(
  entry: ChangelogEntry,
  recipient: ChangelogRecipient,
  portalUrl: string,
): EmailMessage {
  const link = `${portalUrl.replace(/\/$/, "")}/changelog#${entry.id}`;
  const subject = `${entry.breaking ? "[Cambio que rompe compatibilidad] " : ""}Mi Rotaract para desarrolladores: ${entry.title}`;
  const apps = recipient.apps.map(escapeHtml).join(", ");
  const html = [
    `<p>Hola. Te escribimos porque sos responsable de ${recipient.apps.length === 1 ? "la app" : "las apps"} <strong>${apps}</strong> en Mi Rotaract.</p>`,
    `<h2>${escapeHtml(entry.title)}</h2>`,
    markdownToEmailHtml(entry.body),
    `<p><a href="${escapeHtml(link)}">Ver el changelog completo</a> · <a href="${escapeHtml(portalUrl.replace(/\/$/, ""))}/docs/deprecaciones">Política de deprecación</a></p>`,
    `<p style="color:#666;font-size:12px">Recibís este aviso porque sos responsable de una app activa. Los cambios que rompen compatibilidad se anuncian con al menos 6 meses de anticipación.</p>`,
  ].join("\n");
  const text = [
    `Sos responsable de: ${recipient.apps.join(", ")}.`,
    "",
    entry.title,
    "",
    entry.body,
    "",
    `Changelog: ${link}`,
  ].join("\n");
  const digest = createHash("sha256")
    .update(recipient.email)
    .digest("hex")
    .slice(0, 16);
  return {
    to: recipient.email,
    subject,
    html,
    text,
    idempotencyKey: `changelog:${entry.id}:${digest}`,
  };
}

export type NotifyResult = {
  entry: ChangelogEntry;
  recipients: number;
  sent: number;
  dryRun: boolean;
  messages: EmailMessage[];
};

/**
 * Builds one email per owner and sends it through `send` unless `dryRun`.
 * ClickMail deduplicates on the idempotency key, so re-running the command
 * for the same entry does not email anyone twice.
 */
export async function notifyChangelog(input: {
  markdown: string;
  entryId: string;
  store: NotifierStore;
  send: (message: EmailMessage) => Promise<void>;
  dryRun: boolean;
  portalUrl: string;
}): Promise<NotifyResult> {
  const entry = parseChangelog(input.markdown).find(
    (candidate) => candidate.id === input.entryId,
  );
  if (!entry)
    throw new Error(
      `No existe la entrada "${input.entryId}" en el changelog (marcador <!-- entry: ${input.entryId} -->)`,
    );
  const recipients = await changelogRecipients(input.store);
  const messages = recipients.map((recipient) =>
    changelogEmail(entry, recipient, input.portalUrl),
  );
  let sent = 0;
  if (!input.dryRun)
    for (const message of messages) {
      await input.send(message);
      sent += 1;
    }
  return {
    entry,
    recipients: recipients.length,
    sent,
    dryRun: input.dryRun,
    messages,
  };
}
