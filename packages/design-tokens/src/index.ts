export type MrThemeName = "light" | "dark";

export const MR_THEME_NAMES: readonly MrThemeName[] = ["light", "dark"];

/** Semantic state tones shared across @mirotaract/ui and @mirotaract/icons. */
export type MrStateTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * Props for the element that scopes a themed subtree. Packages never read
 * `prefers-color-scheme` or switch themes on their own — the host app
 * decides the theme and applies it explicitly via this attribute pair.
 */
export function mrThemeProps(theme: MrThemeName): {
  className: "mr-theme";
  "data-mr-theme": MrThemeName;
} {
  return { className: "mr-theme", "data-mr-theme": theme };
}
