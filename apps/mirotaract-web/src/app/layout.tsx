import type { Metadata } from "next";
import type { ReactNode } from "react";

import { QueryProvider } from "./providers/query-provider";

export const metadata: Metadata = {
  title: "Mi Rotaract",
  description: "Institutional platform",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
