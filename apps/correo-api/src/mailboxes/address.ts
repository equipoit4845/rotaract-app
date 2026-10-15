/** The only domain mailboxes live on (MX → ClickMail inbound). */
export const MAIL_DOMAIN = 'rotaract4845.com';

/**
 * Local parts a personal address may never take: the position aliases, the
 * platform senders and the RFC 2142 role mailboxes.
 */
const RESERVED = new Set([
  'rdr',
  'secretaria',
  'tesoreria',
  'no-reply',
  'noreply',
  'postmaster',
  'abuse',
  'hostmaster',
  'webmaster',
  'admin',
  'administrador',
  'info',
  'soporte',
  'support',
  'security',
  'distrito',
  'mailer-daemon',
]);

/** "Matías Ñandutí" → "matias nanduti": lowercase ASCII, letters and digits only. */
function fold(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // "O'Higgins" is one word, not "o higgins".
      .replace(/['’`´]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

/**
 * `nombre.apellido` from the first given name and the first surname:
 * "Facundo Matías" + "Cubells" → "facundo.cubells",
 * "María José" + "González Benítez" → "maria.gonzalez".
 * Returns null when there is nothing usable to build it from.
 */
export function baseLocalPart(firstName: string, lastName: string): string | null {
  const first = fold(firstName).split(' ')[0] ?? '';
  // Surname particles ("de la Fuente", "del Valle") stay attached to the surname.
  const surnameWords = fold(lastName).split(' ').filter(Boolean);
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
  const surname: string[] = [];
  for (const word of surnameWords) {
    surname.push(word);
    if (!particles.has(word)) break;
  }
  const last = surname.join('');
  if (!first && !last) return null;
  return [first, last].filter(Boolean).join('.').slice(0, 60);
}

/**
 * The first free local part: base, base2, base3... `taken` answers whether
 * a local part already belongs to another mailbox.
 */
export async function freeLocalPart(base: string, taken: (localPart: string) => Promise<boolean>): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}${n}`;
    if (RESERVED.has(candidate)) continue;
    if (!(await taken(candidate))) return candidate;
  }
  throw new Error(`No free address for ${base}`);
}

export const addressOf = (localPart: string) => `${localPart}@${MAIL_DOMAIN}`;
