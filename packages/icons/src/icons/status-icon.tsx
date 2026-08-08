import type { SVGAttributes } from "react";

/**
 * Generic visual states only — never a Kernel enum. Callers map their own
 * domain status (membership state, period state, application state, ...)
 * onto one of these before reaching this component.
 */
export type MrStatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "active"
  | "inactive"
  | "pending";

export type StatusIconProps = Omit<
  SVGAttributes<SVGSVGElement>,
  "viewBox" | "children"
> & {
  tone: MrStatusTone;
  size?: number;
  title?: string;
};

// active/inactive/pending are lifecycle-shaped aliases of the same three
// visual states, kept separate so call sites read naturally either way.
const TONE_GLYPH: Record<
  MrStatusTone,
  "check" | "triangle" | "octagon" | "info" | "dot"
> = {
  success: "check",
  active: "check",
  warning: "triangle",
  pending: "triangle",
  danger: "octagon",
  info: "info",
  neutral: "dot",
  inactive: "dot",
};

export function StatusIcon({
  tone,
  size = 16,
  title,
  ...props
}: StatusIconProps) {
  const glyph = TONE_GLYPH[tone];

  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {glyph === "check" ? (
        <>
          <circle cx="10" cy="10" r="7.5" />
          <path d="M6.75 10.25 8.75 12.25 13.25 7.75" />
        </>
      ) : null}
      {glyph === "triangle" ? (
        <>
          <path d="M10 3.5 17.25 16H2.75L10 3.5Z" strokeLinejoin="round" />
          <path d="M10 8.25V11.25" />
          <circle
            cx="10"
            cy="13.5"
            r="0.15"
            fill="currentColor"
            stroke="none"
          />
        </>
      ) : null}
      {glyph === "octagon" ? (
        <>
          <path
            d="M6.5 3h7L17 6.5v7L13.5 17h-7L3 13.5v-7L6.5 3Z"
            strokeLinejoin="round"
          />
          <path d="M7.75 7.75 12.25 12.25M12.25 7.75 7.75 12.25" />
        </>
      ) : null}
      {glyph === "info" ? (
        <>
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 9.25V14" />
          <circle cx="10" cy="6.5" r="0.15" fill="currentColor" stroke="none" />
        </>
      ) : null}
      {glyph === "dot" ? (
        <circle cx="10" cy="10" r="4.5" fill="currentColor" stroke="none" />
      ) : null}
    </svg>
  );
}
