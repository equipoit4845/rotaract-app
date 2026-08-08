import { cx } from "../lib/cx";

export type BreadcrumbItem = { label: string; href?: string };

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items.length) return null;

  return (
    <nav aria-label="Miga de pan" className={cx("mr-breadcrumb", className)}>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index ? <span aria-hidden="true">/</span> : null}
          {item.href ? (
            <a href={item.href}>{item.label}</a>
          ) : (
            <span
              aria-current={index === items.length - 1 ? "page" : undefined}
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
