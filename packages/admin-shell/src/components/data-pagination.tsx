import { Button } from "@equipoit4845/ui";
import type { ReactNode } from "react";

import { cx } from "../lib/cx";

export type DataPaginationProps = {
  summary?: ReactNode;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
};

/**
 * Deliberately cursor-shaped (hasPrevious/hasNext), not page-numbered — the
 * Kernel's listings paginate by cursor, not page index.
 */
export function DataPagination({
  summary,
  hasPrevious = false,
  hasNext = false,
  onPrevious,
  onNext,
  previousLabel = "Anterior",
  nextLabel = "Siguiente",
  className,
}: DataPaginationProps) {
  return (
    <div className={cx("mr-data-pagination", className)}>
      {summary ? (
        <p className="mr-data-pagination__summary">{summary}</p>
      ) : (
        <span />
      )}
      <div className="mr-data-pagination__controls">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!hasPrevious}
        >
          {previousLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!hasNext}
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
