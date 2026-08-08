import { cx } from "../lib/cx";

export type AvatarSize = "sm" | "md" | "lg";

export type AvatarProps = {
  /** Full name — drives the initials fallback and the accessible name. */
  name: string;
  src?: string;
  size?: AvatarSize;
  className?: string;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cx("mr-avatar", `mr-avatar--${size}`, className)}
    >
      {src ? (
        <img src={src} alt="" className="mr-avatar__image" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
