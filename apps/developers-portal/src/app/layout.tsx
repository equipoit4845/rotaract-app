import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { CodeCopy } from "@/components/code-copy";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { TryProvider } from "@/components/try-panel";
import { contractVersion } from "@/lib/openapi";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Mi Rotaract para desarrolladores",
    template: "%s · Mi Rotaract Developers",
  },
  description:
    "Guías, quickstarts, referencia de la API y catálogo de eventos para construir apps conectadas a Mi Rotaract.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={publicSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SiteHeader />
        <TryProvider>
          <main>{children}</main>
        </TryProvider>
        <SiteFooter contractVersion={contractVersion} />
        <CodeCopy />
      </body>
    </html>
  );
}
