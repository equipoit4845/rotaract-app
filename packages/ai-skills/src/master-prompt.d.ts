export type Assistant = "claude" | "cursor" | "copilot" | "otro";

export interface AssistantInfo {
  id: Assistant;
  label: string;
  name: string;
  skillsTarget: "claude" | "cursor" | "copilot" | "agents";
  recommended?: boolean;
}

export interface PromptInputs {
  assistant?: Assistant | "auto" | string;
  idea?: string;
  users?: string;
  data?: string;
  scope?: "club" | "distrito" | "" | string;
  template?: "next" | "fastapi" | "" | string;
}

export const ASSISTANTS: Record<Assistant, AssistantInfo>;
export const ASSISTANT_IDS: Assistant[];
export const SCOPES: string[];
export const PROMPT_TEMPLATES: string[];
export const MAX_FIELD: number;
export class PromptTemplateError extends Error {}
export function stripDocComment(template: string): string;
export function applyConditionals(
  template: string,
  flags: Record<string, boolean>,
): string;
export function substitute(
  template: string,
  variables: Record<string, string>,
): string;
export function cleanField(value: unknown): string;
export function renderPrompt(template: string, inputs?: PromptInputs): string;
export function renderMasterPrompt(
  template: string,
  inputs?: PromptInputs,
): string;
export function promptFileName(inputs?: PromptInputs): string;
