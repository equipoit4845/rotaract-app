"use client";

import { useEffect } from "react";

/**
 * Wires every "Copiar" button rendered inside server-generated HTML
 * (Markdown code blocks) with one delegated listener.
 */
export function CodeCopy() {
  useEffect(() => {
    async function onClick(event: MouseEvent) {
      const button = (
        event.target as HTMLElement | null
      )?.closest<HTMLButtonElement>("[data-copy-code]");
      if (!button) return;
      const code = button.closest(".code-block")?.querySelector("pre code");
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.textContent ?? "");
        button.textContent = "Copiado";
      } catch {
        button.textContent = "No se pudo copiar";
      }
      setTimeout(() => (button.textContent = "Copiar"), 1800);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
