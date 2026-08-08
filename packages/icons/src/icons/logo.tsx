import type { SVGAttributes } from "react";

export type LogoProps = Omit<
  SVGAttributes<SVGSVGElement>,
  "viewBox" | "children"
> & {
  size?: number;
  title?: string;
};

/**
 * Placeholder mark — swap the path data for the final brand asset without
 * changing the component's public shape (size/title/className/ref-free svg
 * props all stay valid).
 */
export function Logo({
  size = 24,
  title = "Mi Rotaract",
  ...props
}: LogoProps) {
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle
        cx="12"
        cy="12"
        r="10.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 6.5 16.5 12 12 17.5 7.5 12 12 6.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
