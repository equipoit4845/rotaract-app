/**
 * E9.4 — emails a changelog entry to the owners of every ACTIVE developer
 * app, through the kernel's ClickMail client (NotificationService).
 *
 *   pnpm --filter @mirotaract/institutional-kernel-api notify:changelog -- --entry <id> [--dry-run] [--preview]
 *
 * --dry-run   lists who would receive it (emails masked) and sends nothing.
 * --preview   also prints the text of the first email.
 * Needs KERNEL_DATABASE_URL; sending (no --dry-run) needs CLICKMAIL_API_KEY.
 * DEVELOPERS_PORTAL_URL sets the links (default https://developers.rotaract4845.com).
 * See docs/16-developer-portal.md §Avisos de cambios.
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  notifyChangelog,
  type NotifierStore,
} from "../src/application/changelog/changelog-notifier";
import { NotificationService } from "../src/application/notifications/notification.service";

function changelogPath(explicit?: string): string {
  const candidates = [
    explicit,
    resolve(process.cwd(), "docs/developers/changelog.md"),
    resolve(process.cwd(), "../../docs/developers/changelog.md"),
    resolve(__dirname, "../../../docs/developers/changelog.md"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found)
    throw new Error("No encontré docs/developers/changelog.md (usá --file)");
  return found;
}

function mask(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}***@${domain ?? ""}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      entry: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      preview: { type: "boolean", default: false },
      file: { type: "string" },
    },
  });
  if (!values.entry) {
    console.error(
      "Uso: notify:changelog -- --entry <id> [--dry-run] [--preview]",
    );
    process.exit(2);
  }
  const dryRun = values["dry-run"] === true;
  if (!dryRun && !process.env.CLICKMAIL_API_KEY) {
    console.error(
      "CLICKMAIL_API_KEY no está configurada: no se puede enviar. Usá --dry-run para ver a quién le llegaría.",
    );
    process.exit(2);
  }
  const markdown = readFileSync(changelogPath(values.file), "utf8");
  const prisma = new PrismaClient();
  const mailer = new NotificationService();
  try {
    const result = await notifyChangelog({
      markdown,
      entryId: values.entry,
      store: prisma as unknown as NotifierStore,
      send: (message) => mailer.sendEmail(message),
      dryRun,
      portalUrl:
        process.env.DEVELOPERS_PORTAL_URL ??
        "https://developers.rotaract4845.com",
    });
    console.log(
      `${dryRun ? "[dry-run] " : ""}Entrada "${result.entry.id}": ${result.entry.title}`,
    );
    console.log(
      `Destinatarios: ${result.recipients} · enviados: ${result.sent}${result.entry.breaking ? " · rompe compatibilidad" : ""}`,
    );
    for (const message of result.messages)
      console.log(`  - ${mask(message.to)}  ${message.subject}`);
    if (values.preview && result.messages[0]) {
      console.log("\n--- vista previa (texto) ---\n");
      console.log(result.messages[0].text);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
