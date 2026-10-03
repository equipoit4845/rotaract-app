import type { AnchorHTMLAttributes } from "react";

/**
 * The link every Mi Rotaract component uses for navigation. A plain `<a>`
 * so the kit works in any React app.
 *
 * In Next.js, replace the body with next/link for client-side navigation:
 *
 *   import NextLink from "next/link";
 *   export const MrLink = NextLink;
 */
export function MrLink({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} {...props} />;
}
