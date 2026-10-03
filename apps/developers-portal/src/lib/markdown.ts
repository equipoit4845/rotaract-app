import { Marked, type Tokens } from "marked";

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `lang file=x from=y runnable` → its parts. */
export function parseInfo(info: string | undefined): {
  lang: string;
  file?: string;
  runnable: boolean;
} {
  const tokens = (info ?? "").trim().split(/\s+/).filter(Boolean);
  const lang = tokens.shift() ?? "";
  const attrs = Object.fromEntries(
    tokens
      .filter((token) => token.includes("="))
      .map((token) => {
        const [key, ...value] = token.split("=");
        return [key, value.join("=")];
      }),
  );
  return { lang, file: attrs.file, runnable: tokens.includes("runnable") };
}

const LANG_LABEL: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  js: "JavaScript",
  python: "Python",
  py: "Python",
  bash: "Terminal",
  sh: "Terminal",
  json: "JSON",
  http: "HTTP",
  dart: "Dart",
  yaml: "YAML",
};

/** Code block with a header and a copy button (wired by <CodeCopy />). */
export function codeBlockHtml(code: string, info?: string): string {
  const { lang, file, runnable } = parseInfo(info);
  const label = file ?? LANG_LABEL[lang] ?? (lang || "Código");
  const badge = runnable
    ? ' <span title="Verificado en CI (pnpm quickstarts:check)" class="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">probado en CI</span>'
    : "";
  return `<div class="code-block"><div class="code-block-header"><span class="font-mono">${escapeHtml(label)}${badge}</span><button type="button" class="copy-code" data-copy-code aria-label="Copiar código">Copiar</button></div><pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre></div>`;
}

/**
 * Links between docs (`webhooks.md#firma`) point to the portal's pages;
 * links to files outside docs/developers (repo paths) have no page here and
 * are rendered as text.
 */
export function rewriteHref(href: string): string | null {
  if (/^(https?:|mailto:|#)/i.test(href)) return href;
  const doc = href.match(/^(?:\.\/)?([A-Za-z0-9._-]+)\.md(#.*)?$/);
  if (doc) {
    const slug = doc[1] === "README" ? "introduccion" : doc[1].toLowerCase();
    return `/docs/${slug}${doc[2] ?? ""}`;
  }
  return null;
}

export function renderMarkdown(markdown: string): string {
  const seen = new Map<string, number>();
  const marked = new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }: Tokens.Code) {
        return codeBlockHtml(text, lang);
      },
      heading({ tokens, depth, text }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        if (depth === 1) return `<h1>${inner}</h1>\n`;
        let id = headingId(text);
        const count = seen.get(id) ?? 0;
        seen.set(id, count + 1);
        if (count) id = `${id}-${count}`;
        return `<h${depth} id="${id}">${inner}<a class="heading-anchor" href="#${id}" aria-label="Enlace a esta sección">#</a></h${depth}>\n`;
      },
      link({ href, title, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const target = rewriteHref(href);
        if (!target)
          return `<span title="Archivo del repositorio: ${escapeHtml(href)}">${inner}</span>`;
        const external = /^https?:/i.test(target);
        return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ""}${external ? ' rel="noopener noreferrer" target="_blank"' : ""}>${inner}</a>`;
      },
    },
  });
  // Changelog entries: `<!-- entry: id -->` becomes an anchor (/changelog#id).
  const source = markdown.replace(
    /^<!--\s*entry:\s*([a-z0-9][a-z0-9._-]*)\s*-->\s*$/gim,
    '<span id="$1" class="block scroll-mt-24"></span>',
  );
  return marked.parse(source, { async: false }) as string;
}
