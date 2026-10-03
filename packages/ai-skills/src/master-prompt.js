/**
 * Renderer of the "Creá tu solución con IA" prompts (prompts/_master.md and
 * prompts/_planning.md). Pure and dependency-free on purpose: the developer
 * portal copies this file into its client bundle so the page assembles the
 * prompt live, in the browser, with exactly the same code the tests and
 * /ia/prompt.md use. Nothing is sent anywhere.
 *
 * Template syntax (documented at the top of _master.md):
 *   {{VARIABLE}}                                   one-pass substitution
 *   <!-- if: cond --> … <!-- else --> … <!-- /if -->  nestable conditionals
 *   cond := flag | !flag | a|b   (OR of terms)
 */

/** @typedef {"claude" | "cursor" | "copilot" | "otro"} Assistant */

export const ASSISTANTS = {
  claude: {
    id: "claude",
    label: "Claude Code",
    name: "Claude Code",
    skillsTarget: "claude",
    recommended: true,
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    name: "Cursor (en modo agente)",
    skillsTarget: "cursor",
  },
  copilot: {
    id: "copilot",
    label: "VS Code + Copilot",
    name: "GitHub Copilot en VS Code (modo agente)",
    skillsTarget: "copilot",
  },
  otro: {
    id: "otro",
    label: "Codex u otro",
    name: "un asistente de código (Codex, Gemini CLI u otro que lee AGENTS.md)",
    skillsTarget: "agents",
  },
};
export const ASSISTANT_IDS = Object.keys(ASSISTANTS);
export const SCOPES = ["club", "distrito"];
export const PROMPT_TEMPLATES = ["next", "fastapi"];
/** Longest text accepted per field (the rest is cut, with an ellipsis). */
export const MAX_FIELD = 1500;

const FLAG = /^!?[a-z_]+$/;
const TAG = /<!--\s*(if:\s*([^>]*?)|else|\/if)\s*-->[ \t]*\n?/g;
const VARIABLE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

export class PromptTemplateError extends Error {}

/**
 * Drops the leading `<!-- doc … -->` comment (instructions for maintainers).
 * It ends at a line that is only `-->`, so it may show template syntax.
 */
export function stripDocComment(template) {
  return String(template).replace(
    /^\s*<!--\s*doc\b[\s\S]*?\n-->[ \t]*(?:\n|$)/,
    "",
  );
}

function evaluate(condition, flags) {
  const terms = condition.split("|").map((t) => t.trim());
  if (!terms.length || terms.some((t) => !FLAG.test(t)))
    throw new PromptTemplateError(`Condición inválida: "${condition}"`);
  return terms.some((term) =>
    term.startsWith("!") ? !flags[term.slice(1)] : Boolean(flags[term]),
  );
}

/** Resolves the conditional blocks; throws on unbalanced tags. */
export function applyConditionals(template, flags) {
  const out = [];
  // Each frame: { active: is the current branch shown, parent: was the parent shown, taken: did the if-branch show }
  const stack = [];
  const visible = () => stack.every((frame) => frame.active);
  let last = 0;
  for (const match of template.matchAll(TAG)) {
    if (visible()) out.push(template.slice(last, match.index));
    last = match.index + match[0].length;
    const [, tag, condition] = match;
    if (tag.startsWith("if:")) {
      const active = evaluate(condition, flags);
      stack.push({ active, taken: active, sawElse: false });
    } else if (tag === "else") {
      const frame = stack.at(-1);
      if (!frame || frame.sawElse)
        throw new PromptTemplateError("<!-- else --> sin <!-- if -->");
      frame.sawElse = true;
      frame.active = !frame.taken;
    } else {
      if (!stack.length)
        throw new PromptTemplateError("<!-- /if --> sin <!-- if -->");
      stack.pop();
    }
  }
  if (stack.length)
    throw new PromptTemplateError(
      "Falta cerrar un <!-- if --> con <!-- /if -->",
    );
  out.push(template.slice(last));
  return out.join("");
}

/** One pass: values are never re-read as template syntax. */
export function substitute(template, variables) {
  return template.replace(VARIABLE, (whole, name) => {
    if (!(name in variables))
      throw new PromptTemplateError(`Variable sin valor: {{${name}}}`);
    return String(variables[name]);
  });
}

/** Trimmed, single-paragraph-safe, length-capped user text. */
export function cleanField(value) {
  const text = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (text.length <= MAX_FIELD) return text;
  return `${text.slice(0, MAX_FIELD - 1).trimEnd()}…`;
}

/** Multi-line answers stay inside their Markdown list item. */
function indentForList(text) {
  return text.replace(/\n/g, "\n  ");
}

/**
 * Normalized inputs: assistant "auto" (or anything unknown) renders the
 * generic variant with every assistant's setup.
 */
export function normalizeInputs(inputs = {}) {
  const assistant = ASSISTANT_IDS.includes(inputs.assistant)
    ? inputs.assistant
    : "auto";
  const scope = SCOPES.includes(inputs.scope) ? inputs.scope : "";
  const template = PROMPT_TEMPLATES.includes(inputs.template)
    ? inputs.template
    : "";
  return {
    assistant,
    scope,
    template,
    idea: cleanField(inputs.idea),
    users: cleanField(inputs.users),
    data: cleanField(inputs.data),
  };
}

export function promptFlags(normalized) {
  const auto = normalized.assistant === "auto";
  const flags = {
    auto,
    idea: Boolean(normalized.idea),
    users: Boolean(normalized.users),
    data: Boolean(normalized.data),
    club: normalized.scope === "club",
    distrito: normalized.scope === "distrito",
    template_next: normalized.template === "next",
    template_fastapi: normalized.template === "fastapi",
  };
  for (const id of ASSISTANT_IDS)
    flags[id] = auto || normalized.assistant === id;
  return flags;
}

export function promptVariables(normalized) {
  const assistant = ASSISTANTS[normalized.assistant];
  return {
    ASSISTANT_NAME: assistant
      ? assistant.name
      : "un asistente de código (Claude Code, Cursor, Copilot en modo agente, Codex u otro)",
    SKILLS_TARGET: assistant ? assistant.skillsTarget : "<destino>",
    IDEA: indentForList(normalized.idea),
    USERS: indentForList(normalized.users),
    DATA: indentForList(normalized.data),
  };
}

/** Renders a prompt template (_master.md or _planning.md) for the inputs. */
export function renderPrompt(template, inputs = {}) {
  const normalized = normalizeInputs(inputs);
  const body = applyConditionals(
    stripDocComment(template),
    promptFlags(normalized),
  );
  return `${substitute(body, promptVariables(normalized))
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

export const renderMasterPrompt = renderPrompt;

/** File name for "descargar como archivo". */
export function promptFileName(inputs = {}) {
  const { assistant } = normalizeInputs(inputs);
  return assistant === "auto"
    ? "mirotaract-prompt.md"
    : `mirotaract-prompt-${assistant}.md`;
}
