import "@equipoit4845/design-tokens/tokens.css";
import "@equipoit4845/design-tokens/reset.css";
import "@equipoit4845/ui/styles.css";
import "@equipoit4845/admin-shell/styles.css";

import { mrThemeProps } from "@equipoit4845/design-tokens";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "./providers/query-provider";

export const metadata: Metadata = {
  title: "Mi Rotaract",
  description: "Institutional platform",
};

// Fixed to "light" for now — no theme picker yet. The Web Shell (here, not
// any @mirotaract/* package) is where that choice belongs once it exists;
// see docs/08-design-system.md's theming contract.
const ACTIVE_THEME = "light" as const;

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <div
          {...mrThemeProps(ACTIVE_THEME)}
          style={{
            minHeight: "100vh",
            background: "var(--mr-color-canvas)",
            color: "var(--mr-color-text)",
            fontFamily: "var(--mr-font-sans)",
          }}
        >
          <QueryProvider>{children}</QueryProvider>
        </div>
      </body>
    </html>
  );
}
