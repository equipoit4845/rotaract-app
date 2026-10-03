import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { QueryProvider } from "./providers/query-provider";
import { ThemeProvider } from "./providers/theme-provider";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

export const metadata: Metadata = {
  title: "Mi Rotaract",
  description:
    "Gestión institucional de los clubes y el Distrito 4845 de Rotaract.",
  applicationName: "Mi Rotaract",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={publicSans.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
