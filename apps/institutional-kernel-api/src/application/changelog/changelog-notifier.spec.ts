import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  changelogRecipients,
  markdownToEmailHtml,
  notifyChangelog,
  parseChangelog,
  type NotifierStore,
} from "./changelog-notifier";

const MARKDOWN = `# Changelog

Intro.

<!-- entry: e9-portal -->
## 2026-10-04 · Portal de desarrolladores (E9)

**Tipo:** nuevo · **Compatibilidad:** sin cambios que rompan

- Registros de requests.
- \`traceId\` siempre en los errores.

<!-- entry: e10-break -->
## 2027-04-04 · Se retira algo

**Tipo:** retiro · **Compatibilidad:** rompe compatibilidad

Texto <script>.

## Cómo leer esto

No es una entrada.
`;

function store(): NotifierStore & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    developerApp: {
      findMany: jest.fn(async (args) => {
        calls.push(`apps:${args.where.status}`);
        return [
          { name: "Padrón", ownerPersonId: "p1" },
          { name: "Asistencia", ownerPersonId: "p1" },
          { name: "Eventos", ownerPersonId: "p2" },
          { name: "Huérfana", ownerPersonId: "p3" },
        ];
      }),
    },
    userAccount: {
      findMany: jest.fn(async (args) => {
        calls.push(`accounts:${args.where.status}`);
        return [
          { personId: "p1", email: "Owner.One@Example.org" },
          { personId: "p2", email: "two@example.org" },
        ];
      }),
    },
  };
}

describe("changelog notices (E9.4)", () => {
  it("parses entries by their marker, stopping at other sections", () => {
    const entries = parseChangelog(MARKDOWN);
    expect(entries.map((entry) => entry.id)).toEqual([
      "e9-portal",
      "e10-break",
    ]);
    expect(entries[0].title).toBe(
      "2026-10-04 · Portal de desarrolladores (E9)",
    );
    expect(entries[0].breaking).toBe(false);
    expect(entries[1].breaking).toBe(true);
    expect(entries[1].body).not.toContain("No es una entrada");
  });

  it("the real changelog has entries for E2 to E7 with unique ids", () => {
    const markdown = readFileSync(
      resolve(__dirname, "../../../../../docs/developers/changelog.md"),
      "utf8",
    );
    const ids = parseChangelog(markdown).map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const epic of ["e2", "e3", "e4", "e5", "e6", "e7"])
      expect(ids.some((id) => id.startsWith(`${epic}-`))).toBe(true);
  });

  it("emails each active owner account once, listing their apps", async () => {
    const recipients = await changelogRecipients(store());
    expect(recipients).toEqual([
      { email: "owner.one@example.org", apps: ["Asistencia", "Padrón"] },
      { email: "two@example.org", apps: ["Eventos"] },
    ]);
  });

  it("dry run builds the messages and sends nothing", async () => {
    const send = jest.fn();
    const result = await notifyChangelog({
      markdown: MARKDOWN,
      entryId: "e10-break",
      store: store(),
      send,
      dryRun: true,
      portalUrl: "https://developers.example.org/",
    });
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ recipients: 2, sent: 0, dryRun: true });
    const [first] = result.messages;
    expect(first.subject).toMatch(/^\[Cambio que rompe compatibilidad\]/);
    expect(first.html).toContain(
      "https://developers.example.org/changelog#e10-break",
    );
    expect(first.html).not.toContain("<script>");
    expect(first.idempotencyKey).toMatch(/^changelog:e10-break:[0-9a-f]{16}$/);
  });

  it("sends one email per recipient when not a dry run", async () => {
    const send = jest.fn(async () => undefined);
    const result = await notifyChangelog({
      markdown: MARKDOWN,
      entryId: "e9-portal",
      store: store(),
      send,
      dryRun: false,
      portalUrl: "https://developers.example.org",
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(2);
  });

  it("fails clearly for an unknown entry", async () => {
    await expect(
      notifyChangelog({
        markdown: MARKDOWN,
        entryId: "nope",
        store: store(),
        send: jest.fn(),
        dryRun: true,
        portalUrl: "https://x",
      }),
    ).rejects.toThrow(/No existe la entrada "nope"/);
  });

  it("renders bullets, code and bold safely", () => {
    expect(markdownToEmailHtml("- **a** `b`\n- <c>")).toBe(
      "<ul><li><strong>a</strong> <code>b</code></li><li>&lt;c&gt;</li></ul>",
    );
  });
});
