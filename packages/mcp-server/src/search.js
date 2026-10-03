/**
 * Small full-text search over the developer guides: documents are split in
 * sections (by `##`/`###` headings, code fences respected) and ranked with
 * BM25. Accent- and case-insensitive, Spanish stop words dropped.
 */

const STOP = new Set(
  "a al algo como con cual cuando de del desde donde el ella en es esa ese eso esta este esto hay la las lo los mas me mi muy no o para pero por que se si sin sobre su sus te tu un una uno y ya the of to and in is for on".split(" "),
);

export function fold(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function tokenize(text) {
  return fold(text)
    .split(/[^a-z0-9_.]+/)
    .flatMap((t) => (t.includes(".") ? [t, ...t.split(".")] : [t]))
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** GitHub-style anchor of a heading. */
export function anchor(heading) {
  return fold(heading)
    .replace(/`/g, "")
    .replace(/[^a-z0-9 _-]/g, "")
    .trim()
    .replace(/ /g, "-");
}

export function splitSections(doc) {
  const sections = [];
  let current = { heading: doc.title, level: 1, lines: [] };
  let fenced = false;
  for (const line of doc.content.split("\n")) {
    if (/^```/.test(line)) fenced = !fenced;
    const match = !fenced && line.match(/^(#{2,3})\s+(.*)$/);
    if (match) {
      if (current.lines.join("").trim()) sections.push(current);
      current = { heading: match[2].trim(), level: match[1].length, lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.join("").trim()) sections.push(current);
  return sections.map((s) => ({
    slug: doc.slug,
    path: doc.path,
    docTitle: doc.title,
    heading: s.heading,
    anchor: s.level === 1 ? "" : anchor(s.heading),
    text: s.lines.join("\n").trim(),
  }));
}

export function createIndex(docs) {
  const sections = docs.flatMap(splitSections).map((s) => {
    const tokens = [...tokenize(`${s.heading} ${s.heading} ${s.docTitle}`), ...tokenize(s.text)];
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { ...s, tf, length: tokens.length };
  });
  const df = new Map();
  for (const s of sections) for (const t of s.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avg = sections.reduce((n, s) => n + s.length, 0) / Math.max(sections.length, 1);
  return { sections, df, avg };
}

function snippet(text, terms, size = 420) {
  const plain = text.replace(/\n{2,}/g, "\n").trim();
  const folded = fold(plain);
  let at = -1;
  for (const t of terms) {
    at = folded.indexOf(t);
    if (at >= 0) break;
  }
  const start = Math.max(0, at < 0 ? 0 : at - 120);
  const out = plain.slice(start, start + size);
  return `${start > 0 ? "…" : ""}${out}${start + size < plain.length ? "…" : ""}`;
}

export function search(index, query, limit = 5) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const N = index.sections.length;
  const k1 = 1.2;
  const b = 0.75;
  const scored = index.sections
    .map((s) => {
      let score = 0;
      for (const t of terms) {
        const f = s.tf.get(t);
        if (!f) continue;
        const n = index.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * s.length) / index.avg)));
      }
      return { s, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score || a.s.path.localeCompare(b2.s.path));
  return scored.slice(0, limit).map(({ s, score }) => ({
    path: s.path,
    slug: s.slug,
    heading: s.heading,
    anchor: s.anchor,
    score: Math.round(score * 100) / 100,
    snippet: snippet(s.text, terms),
  }));
}
