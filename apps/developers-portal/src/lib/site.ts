/** Public URL of the portal (absolute links for "Abrir en Claude/ChatGPT"). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://developers.rotaract4845.com"
).replace(/\/$/, "");

export const PRODUCTION_API = "https://api.rotaract4845.com/api/kernel/v1";
/** The local kernel of `mirotaract dev up` (docs/developers/cli.md). */
export const LOCAL_API = "http://localhost:54321/api/kernel/v1";
export const CONSOLE_URL = "https://app.rotaract4845.com/developer/apps";

export function assistantPrompt(slug: string): string {
  return `Leé la documentación de Mi Rotaract para desarrolladores en ${SITE_URL}/docs/${slug}.md y ayudame a aplicarla en mi proyecto.`;
}

export function claudeUrl(slug: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(assistantPrompt(slug))}`;
}

export function chatGptUrl(slug: string): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(assistantPrompt(slug))}`;
}
