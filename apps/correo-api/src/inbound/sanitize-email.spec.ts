import { sanitizeEmailHtml } from './sanitize-email';

const clean = (html: string) => sanitizeEmailHtml(html)!.html;

describe('sanitizeEmailHtml', () => {
  it('returns null for an empty body', () => {
    expect(sanitizeEmailHtml(null)).toBeNull();
    expect(sanitizeEmailHtml('   ')).toBeNull();
  });

  it('drops scripts, event handlers, iframes and forms', () => {
    const out = clean(
      '<p onclick="steal()">Hola</p><script>alert(1)</script><iframe src="https://x"></iframe><form action="https://x"><input name="p"></form><img src=x onerror=alert(1)>',
    );
    expect(out).toBe('<p>Hola</p><img />');
  });

  it('removes javascript: and protocol-relative links, opens the rest apart', () => {
    expect(clean('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
    expect(clean('<a href="//evil.example/x">x</a>')).not.toContain('evil.example');
    expect(clean('<a href="https://rotary.org">Rotary</a>')).toBe(
      '<a href="https://rotary.org" target="_blank" rel="noopener noreferrer nofollow">Rotary</a>',
    );
  });

  it('switches remote images off and reports them', () => {
    const out = sanitizeEmailHtml('<img src="https://cdn.example/logo.png" alt="Logo" width="120">')!;
    expect(out.remoteImages).toBe(true);
    expect(out.html).toBe('<img alt="Logo" width="120" data-cd-src="https://cdn.example/logo.png" />');
  });

  it('drops 1x1 tracking pixels and keeps data: images', () => {
    const out = sanitizeEmailHtml(
      '<img src="https://t.example/open.gif" width="1" height="1"><img src="https://t.example/p" style="display:none"><img src="data:image/png;base64,AAAA">',
    )!;
    expect(out.remoteImages).toBe(false);
    expect(out.html).toBe('<img src="data:image/png;base64,AAAA" />');
  });

  it('keeps layout: tables, inline styles and <style>', () => {
    const out = clean(
      '<style>.x{color:red}</style><table width="600" bgcolor="#fff"><tr><td style="padding:8px" class="x">Hola</td></tr></table>',
    );
    expect(out).toContain('<style>.x{color:red}</style>');
    expect(out).toContain('<td style="padding:8px" class="x">Hola</td>');
  });
});
