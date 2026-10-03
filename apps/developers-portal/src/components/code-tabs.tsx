"use client";

import { useState } from "react";

type Tab = { id: string; label: string; code: string; note?: string };

/** curl / TypeScript / Python examples of an operation. */
export function CodeTabs({ tabs, title }: { tabs: Tab[]; title: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const [copied, setCopied] = useState(false);
  const tab = tabs.find((candidate) => candidate.id === active) ?? tabs[0];
  if (!tab) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(tab.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is still selectable */
    }
  }

  return (
    <div className="code-block my-0">
      <div className="code-block-header" role="tablist" aria-label={title}>
        <div className="flex gap-1">
          {tabs.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={candidate.id === tab.id}
              onClick={() => setActive(candidate.id)}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                candidate.id === tab.id
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <button type="button" className="copy-code" onClick={copy}>
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      {tab.note ? (
        <p className="border-b border-white/10 px-4 py-2 text-xs text-white/70">
          {tab.note}
        </p>
      ) : null}
      <pre>
        <code>{tab.code}</code>
      </pre>
    </div>
  );
}
