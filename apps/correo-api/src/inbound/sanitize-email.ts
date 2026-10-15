import sanitizeHtml from 'sanitize-html';

/**
 * Received HTML → markup safe to show in the reader's sandboxed iframe:
 *
 * - an allowlist of layout tags and attributes; scripts, iframes, forms,
 *   event handlers and `javascript:` URLs never survive;
 * - links open in a new tab without a referrer;
 * - remote images are switched off: `src` moves to `data-cd-src`, and the
 *   reader puts it back only when the person asks ("Mostrar imágenes");
 * - 1×1 tracking pixels are dropped altogether;
 * - inline parts (`src="cid:…"`) become `data-cd-cid`, resolved by the reader
 *   to the attachment's short-lived link (`resolveInlineImages`).
 *
 * Defense in depth: the iframe has no `allow-scripts` and its own CSP.
 */
export type SafeHtml = { html: string; remoteImages: boolean };

const isPixel = (attribs: Record<string, string>) => {
  const w = Number.parseInt(attribs.width ?? '', 10);
  const h = Number.parseInt(attribs.height ?? '', 10);
  const style = (attribs.style ?? '').replace(/\s+/g, '').toLowerCase();
  return (
    (w <= 1 && h <= 1 && !Number.isNaN(w) && !Number.isNaN(h)) ||
    /(^|;)(width:[01]px|height:[01]px|display:none)/.test(style)
  );
};

export function sanitizeEmailHtml(raw: string | null): SafeHtml | null {
  if (!raw?.trim()) return null;
  let remoteImages = false;
  const html = sanitizeHtml(raw, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'style',
      'center',
      'font',
      'span',
      'del',
      'ins',
      'u',
      's',
      'small',
      'big',
      'sub',
      'sup',
    ],
    // <style> is kept for email layouts: inside a scriptless iframe with
    // `default-src 'none'` it can restyle the message and nothing else.
    allowVulnerableTags: true,
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'title', 'head'],
    allowedAttributes: {
      '*': [
        'style',
        'class',
        'align',
        'valign',
        'width',
        'height',
        'bgcolor',
        'color',
        'border',
        'cellpadding',
        'cellspacing',
        'dir',
        'lang',
        'title',
        'colspan',
        'rowspan',
        'face',
        'size',
      ],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height', 'data-cd-src', 'data-cd-cid'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    exclusiveFilter: (frame) => frame.tag === 'img' && isPixel(frame.attribs),
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
      img: (tagName, attribs) => {
        const { src, ...rest } = attribs;
        if (src && /^https?:/i.test(src)) {
          // Tracking pixels are dropped by exclusiveFilter: they don't count.
          if (!isPixel(attribs)) remoteImages = true;
          return { tagName, attribs: { ...rest, 'data-cd-src': src } };
        }
        // cid: = an inline part of the same email; the reader swaps in its link.
        if (src && /^cid:/i.test(src)) {
          return { tagName, attribs: { ...rest, 'data-cd-cid': normalizeCid(src.slice(4)) } };
        }
        // data: images stay.
        return { tagName, attribs: src && /^data:image\//i.test(src) ? attribs : rest };
      },
    },
  });
  return { html, remoteImages };
}

/** "<abc@x>" / "abc@x" → "abc@x" (Content-ID as referenced from the HTML). */
export function normalizeCid(id: string): string {
  let value = id;
  try {
    value = decodeURIComponent(id);
  } catch {
    // Malformed %-escapes: keep it as written.
  }
  return value.trim().replace(/^<|>$/g, '').toLowerCase();
}

/** Puts each inline part's link in place of its `data-cd-cid`; unknown ones stay without an image. */
export function resolveInlineImages(html: string, urls: Map<string, string>): string {
  return html.replace(/ data-cd-cid="([^"]*)"/g, (whole, cid: string) => {
    const url = urls.get(cid.replace(/&amp;/g, '&'));
    return url ? ` src="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"` : '';
  });
}

/**
 * What the composer sends, cleaned again here: only the formatting the editor
 * produces (paragraphs, bold, italic, underline, strike, links, lists, quotes,
 * headings and inline images by `cid:`). Anything else is dropped.
 */
export function sanitizeOutgoingHtml(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'h2',
      'h3',
      'img',
      'hr',
      'code',
      'pre',
    ],
    allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['cid'] },
    allowProtocolRelative: false,
    // An image whose link did not survive (a draft's local blob:) is dropped.
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
      }),
    },
  });
}
