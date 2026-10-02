import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/;

/** Minimal dotenv parser (KEY=value, quotes, # comments). */
export function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(LINE);
    if (!match) continue;
    values[match[1]] = unquote(match[2] ?? "");
  }
  return values;
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
    return trimmed.slice(1, -1);
  // Inline comment only when preceded by whitespace (values like a#b stay intact).
  return trimmed.replace(/\s+#.*$/, "");
}

export function formatValue(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@,+=-]*$/.test(text)) return text;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

export function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return parseEnv(readFileSync(path, "utf8"));
}

/**
 * Merges `updates` into the dotenv file at `path`:
 * - keys that already exist are replaced in place (comments and the rest of
 *   the file are kept);
 * - new keys are appended under `header`;
 * - keys listed in `keepExisting` are only written when absent (e.g. a
 *   SESSION_SECRET the developer already chose);
 * - `undefined`/`null` values are skipped.
 * The file is written with mode 0600 because it holds secrets.
 * Returns the list of keys that changed.
 */
export function mergeEnvFile(
  path,
  updates,
  { header, keepExisting = [] } = {},
) {
  const original = existsSync(path) ? readFileSync(path, "utf8") : "";
  const current = parseEnv(original);
  const lines = original ? original.replace(/\n$/, "").split(/\r?\n/) : [];
  const pending = new Map();
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) continue;
    if (
      keepExisting.includes(key) &&
      current[key] !== undefined &&
      current[key] !== ""
    )
      continue;
    pending.set(key, String(value));
  }
  const changed = [];
  const out = lines.map((line) => {
    const match = line.match(LINE);
    if (!match || !pending.has(match[1])) return line;
    const key = match[1];
    const value = pending.get(key);
    pending.delete(key);
    if (current[key] !== value) changed.push(key);
    return `${key}=${formatValue(value)}`;
  });
  if (pending.size) {
    if (out.length && out[out.length - 1].trim() !== "") out.push("");
    if (header)
      out.push(...header.split("\n").map((line) => `# ${line}`.trimEnd()));
    for (const [key, value] of pending) {
      out.push(`${key}=${formatValue(value)}`);
      changed.push(key);
    }
  }
  writeFileSync(path, `${out.join("\n")}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Not fatal on filesystems without POSIX modes.
  }
  return changed;
}

/** True when `.gitignore` in `dir` ignores `name` (simple patterns only). */
export function isGitIgnored(gitignoreText, name) {
  return gitignoreText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .some((pattern) => {
      const clean = pattern.replace(/^\//, "");
      if (clean === name || clean === `${name}/`) return true;
      if (!clean.includes("*")) return false;
      const regex = new RegExp(
        `^${clean.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
      );
      return regex.test(name);
    });
}
