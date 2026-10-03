import docsJson from "@/generated/docs.json";
import metaJson from "@/generated/meta.json";
import navJson from "@/generated/nav.json";
import registryJson from "@/generated/registry.json";

/** Generated at build time by scripts/prepare-content.mjs from docs/developers. */
export type Doc = {
  slug: string;
  file: string;
  title: string;
  description: string;
  group: string;
  markdown: string;
  outline: Array<{ heading: string; id: string }>;
};

export type NavGroup = {
  title: string;
  pages: Array<{ slug: string; title: string }>;
};

export type RegistryIndex = {
  name: string;
  items: Array<{
    name: string;
    type: string | null;
    title: string;
    description: string;
    available: boolean;
  }>;
} | null;

export type Meta = {
  builtAt: string;
  contractVersion: string | null;
  registryItems: number;
  llms: boolean;
};

export const docs = docsJson as Doc[];
export const nav = navJson as NavGroup[];
export const meta = metaJson as Meta;
export const registry = registryJson as RegistryIndex;

export function getDoc(slug: string): Doc | undefined {
  return docs.find((doc) => doc.slug === slug);
}

export const QUICKSTARTS = [
  {
    slug: "quickstart-nextjs",
    name: "Next.js",
    blurb: "App Router, sesión cifrada en cookie y padrón del club.",
    lang: "TypeScript",
  },
  {
    slug: "quickstart-express",
    name: "Express",
    blurb: "API que verifica el token de tu app móvil y recibe webhooks.",
    lang: "TypeScript",
  },
  {
    slug: "quickstart-fastapi",
    name: "FastAPI",
    blurb: "Login con sesión del lado del servidor y padrón del club.",
    lang: "Python",
  },
  {
    slug: "quickstart-flutter",
    name: "Flutter",
    blurb: "App móvil PUBLIC con PKCE en el navegador del sistema.",
    lang: "Dart",
  },
] as const;
