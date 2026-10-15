import type { Prisma } from '../prisma/client';

const has = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/**
 * The inbox search box: `de:ana`, `para:ana@club.org` (the whole address),
 * `asunto:cuotas`, `adjunto`
 * (or `tiene:adjunto`), and free words, all required (AND). A word matches
 * the subject, the snippet, a sender or a body; quotes keep words together.
 * Returns one Prisma condition per term, for `thread.findMany({ where: { AND } })`.
 */
export function parseSearch(query: string): Prisma.ThreadWhereInput[] {
  const terms = query.match(/(\w+:)?"[^"]*"|\S+/g) ?? [];
  const out: Prisma.ThreadWhereInput[] = [];
  for (const raw of terms) {
    const m = /^(de|para|asunto|tiene):(.*)$/i.exec(raw);
    const key = m?.[1].toLowerCase();
    const value = (m ? m[2] : raw).replace(/^"|"$/g, '').trim();
    if (key === 'tiene' ? false : !value) continue;
    if (/^(adjunto|adjuntos)$/i.test(raw) || (key === 'tiene' && /^adjuntos?$/i.test(value))) {
      out.push({ messages: { some: { attachments: { some: {} } } } });
    } else if (key === 'de') {
      out.push({ messages: { some: { OR: [{ fromEmail: has(value) }, { fromName: has(value) }] } } });
    } else if (key === 'para') {
      out.push({
        messages: {
          some: { OR: [{ toEmails: { has: value.toLowerCase() } }, { ccEmails: { has: value.toLowerCase() } }] },
        },
      });
    } else if (key === 'asunto') {
      out.push({ subject: has(value) });
    } else if (value) {
      out.push({
        OR: [
          { subject: has(value) },
          { snippet: has(value) },
          { messages: { some: { OR: [{ fromEmail: has(value) }, { fromName: has(value) }, { text: has(value) }] } } },
        ],
      });
    }
  }
  return out;
}
