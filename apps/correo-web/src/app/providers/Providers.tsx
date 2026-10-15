"use client";

import { ThemeProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

export function ThemeProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <ThemedToaster />
    </ThemeProvider>
  );
}

/** sonner follows the app's light/dark theme. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      richColors
      position="bottom-left"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}
