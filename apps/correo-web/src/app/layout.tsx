import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { ThemeProviders } from "./providers/Providers";
import "./globals.css";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

export const metadata: Metadata = {
  title: "Correo Distrital — Mi Rotaract",
  description:
    "Casillas @rotaract4845.com de las autoridades del Distrito 4845",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={publicSans.variable} suppressHydrationWarning>
      <body>
        <ThemeProviders>{children}</ThemeProviders>
      </body>
    </html>
  );
}
