"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

type Contact = { email: string; name: string | null };

/**
 * A Gmail-style recipients row: label, chips, the text being typed, and
 * whatever `trailing` brings at the end (the CC / CCO toggles).
 * Typing a comma, a space, Enter or leaving the field
 * turns the text into a chip; suggestions come from who this mailbox
 * already wrote to or heard from. Invalid addresses stay as red chips.
 */
export function RecipientInput({
  mailboxId,
  label,
  value,
  onChange,
  autoFocus,
  trailing,
}: {
  mailboxId: string;
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  autoFocus?: boolean;
  trailing?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2) return setSuggestions([]);
    const timer = setTimeout(() => {
      api<Contact[]>(
        `/mailboxes/${mailboxId}/contacts?q=${encodeURIComponent(q)}`,
      )
        .then((list) => {
          setSuggestions(list.filter((c) => !value.includes(c.email)));
          setActive(0);
        })
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [text, mailboxId, value]);

  const add = (raw: string) => {
    const parts = raw
      .split(/[,;\s]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;
    onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setText("");
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <div
        className="flex min-h-10 flex-wrap items-center gap-1 border-b px-3 py-1"
        onClick={() => input.current?.focus()}
      >
        <span className="w-10 shrink-0 text-sm text-muted-foreground">
          {label}
        </span>
        {value.map((email) => (
          <span
            key={email}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              EMAIL.test(email)
                ? "bg-muted text-foreground"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
            title={EMAIL.test(email) ? email : "No parece una dirección válida"}
          >
            {email}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== email))}
              aria-label={`Quitar ${email}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;\s]$/.test(v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && suggestions.length) {
              e.preventDefault();
              setActive((a) => (a + 1) % suggestions.length);
            } else if (e.key === "ArrowUp" && suggestions.length) {
              e.preventDefault();
              setActive(
                (a) => (a - 1 + suggestions.length) % suggestions.length,
              );
            } else if (e.key === "Enter") {
              if (suggestions[active]) {
                e.preventDefault();
                add(suggestions[active].email);
              } else if (text.trim()) {
                e.preventDefault();
                add(text);
              }
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === "Escape" && suggestions.length) {
              e.stopPropagation();
              setSuggestions([]);
            }
          }}
          onBlur={() => setTimeout(() => text.trim() && add(text), 150)}
          inputMode="email"
          aria-label={label}
          className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none"
        />
        {trailing ? (
          <span className="ml-auto flex shrink-0 gap-2">{trailing}</span>
        ) : null}
      </div>
      {suggestions.length ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg"
        >
          {suggestions.map((c, i) => (
            <li key={c.email}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(c.email);
                }}
                className={cn(
                  "flex w-full flex-col items-start px-3 py-1.5 text-left text-sm",
                  i === active ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                {c.name ? (
                  <span className="text-foreground">{c.name}</span>
                ) : null}
                <span className="text-xs text-muted-foreground">{c.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export const isEmail = (v: string) => EMAIL.test(v);
