import { DEFAULT_EMAIL_LOGO_URL, emailLayout } from "./email-layout";

describe("emailLayout", () => {
  it("puts the hosted logo (absolute https URL) above the body", () => {
    const html = emailLayout("<p>Confirmá tu cuenta.</p>");
    expect(DEFAULT_EMAIL_LOGO_URL).toMatch(
      /^https:\/\/.+\/brand\/logo-rotaract-distrito-4845\.png$/,
    );
    expect(html).toContain(`src="${DEFAULT_EMAIL_LOGO_URL}"`);
    expect(html).toContain('alt="Rotaract Distrito 4845"');
    expect(html.indexOf("<img")).toBeLessThan(
      html.indexOf("<p>Confirmá tu cuenta.</p>"),
    );
  });

  it("escapes a configured logo URL", () => {
    const html = emailLayout("<p>x</p>", 'https://cdn.example/l.png?a=1&b="2"');
    expect(html).toContain(
      'src="https://cdn.example/l.png?a=1&amp;b=&quot;2&quot;"',
    );
  });
});
