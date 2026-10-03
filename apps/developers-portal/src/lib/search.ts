/** Entries of public/search-index.json (scripts/prepare-content.mjs). */
export type SearchEntry = {
  kind: "doc" | "api";
  title: string;
  url: string;
  text: string;
};

export function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Every term must appear (accent-insensitive); matches in the title weigh more. */
export function searchEntries(
  entries: SearchEntry[],
  query: string,
  limit = 10,
): SearchEntry[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: Array<{ entry: SearchEntry; score: number }> = [];
  for (const entry of entries) {
    const title = normalize(entry.title);
    const text = normalize(entry.text);
    let score = 0;
    let matched = true;
    for (const term of terms) {
      if (title.includes(term)) score += 3;
      else if (text.includes(term)) score += 1;
      else {
        matched = false;
        break;
      }
    }
    if (matched) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.entry);
}
