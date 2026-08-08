import type { HTMLAttributes } from "react";

import { cx } from "../lib/cx";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cx("mr-card", className)} />;
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("mr-card__header", className)} />;
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={cx("mr-card__title", className)} />;
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={cx("mr-card__description", className)} />;
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("mr-card__content", className)} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("mr-card__footer", className)} />;
}
