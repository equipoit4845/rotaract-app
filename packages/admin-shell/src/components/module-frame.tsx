import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type ModuleFrameProps = {
  moduleName: string;
  organizationName: string;
  periodLabel?: string;
  backHref: string;
  backLabel?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Deliberately minimal: module name, organization, period, a back link,
 * and content. No sidebar, no refresh, no session, no authorization, no
 * module discovery, no institutional navigation — an external module gets
 * exactly this and resolves everything else itself.
 */
export function ModuleFrame({
  moduleName,
  organizationName,
  periodLabel,
  backHref,
  backLabel = "Volver",
  children,
  className,
}: ModuleFrameProps) {
  return (
    <div className={cx("mr-module-frame", className)}>
      <header className="mr-module-frame__header">
        <a href={backHref} className="mr-module-frame__back">
          <span aria-hidden="true">←</span> {backLabel}
        </a>
        <div className="mr-module-frame__meta">
          <p className="mr-module-frame__module-name">{moduleName}</p>
          <p className="mr-module-frame__context">
            {organizationName}
            {periodLabel ? ` · ${periodLabel}` : ""}
          </p>
        </div>
      </header>
      <main className="mr-module-frame__content">{children}</main>
    </div>
  );
}
