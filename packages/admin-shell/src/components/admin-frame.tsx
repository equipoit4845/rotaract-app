import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type AdminNavItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  active?: boolean;
};

export type AdminFrameProps = {
  brand?: ReactNode;
  /** Already filtered by the host's permission model — this never interprets it. */
  navItems: AdminNavItem[];
  organizationSwitcher?: ReactNode;
  periodIndicator?: ReactNode;
  user?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Structural admin shell only. No session handling, no permission
 * interpretation, no data fetching, no module discovery — those live in the
 * Web Shell, which passes this component already-resolved props.
 */
export function AdminFrame({
  brand,
  navItems,
  organizationSwitcher,
  periodIndicator,
  user,
  actions,
  children,
  className,
}: AdminFrameProps) {
  return (
    <div className={cx("mr-admin-frame", className)}>
      <aside className="mr-admin-frame__sidebar">
        {brand ? <div className="mr-admin-frame__brand">{brand}</div> : null}
        <nav aria-label="Navegación principal" className="mr-admin-frame__nav">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cx(
                "mr-admin-frame__nav-item",
                item.active && "mr-admin-frame__nav-item--active",
              )}
            >
              {item.icon ? (
                <span aria-hidden="true" className="mr-admin-frame__nav-icon">
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="mr-admin-frame__main">
        <header className="mr-admin-frame__header">
          <div className="mr-admin-frame__header-primary">
            {organizationSwitcher}
            {periodIndicator}
          </div>
          <div className="mr-admin-frame__header-secondary">
            {actions}
            {user}
          </div>
        </header>
        <main className="mr-admin-frame__content">{children}</main>
      </div>
    </div>
  );
}
