"use client";

import type { ReactNode } from "react";

import {
  DataPagination,
  DataState,
  DataToolbar,
} from "@/components/mirotaract/data-display";
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/mirotaract/ui";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  /** Unique key of the column. */
  key: string;
  header: ReactNode;
  /** What the cell shows. Default: `String(row[key])`. */
  cell?: (row: T) => ReactNode;
  /** E.g. "text-right" for an actions column. */
  className?: string;
};

/**
 * The lists of Mi Rotaract (Socios, Autoridades, Apps...): a table with a
 * toolbar on top, skeleton rows while loading, the empty/error state in
 * plain words and cursor pagination ("Anterior" / "Siguiente"), built from
 * the product's Table, DataToolbar, DataState and DataPagination.
 *
 *   <DataTable
 *     rows={socios}
 *     getRowId={(s) => s.membershipId}
 *     columns={[
 *       { key: "name", header: "Nombre", cell: (s) => s.person.displayName },
 *       { key: "status", header: "Estado",
 *         cell: (s) => <StatusBadge kind="membership" status={s.status} /> },
 *     ]}
 *     empty={{ title: "Todavía no hay socios" }}
 *   />
 */
export function DataTable<T>({
  rows,
  columns,
  getRowId,
  isLoading = false,
  error,
  empty,
  toolbar,
  pagination,
  onRowClick,
  className,
}: {
  rows: T[] | undefined;
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  /** Shown instead of the table, e.g. { title: "No pudimos cargar los socios." }. */
  error?: {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
  } | null;
  empty?: { title: ReactNode; description?: ReactNode; action?: ReactNode };
  toolbar?: {
    primary?: ReactNode;
    search?: ReactNode;
    filters?: ReactNode;
    actions?: ReactNode;
  };
  pagination?: {
    summary: ReactNode;
    hasPrevious?: boolean;
    hasNext?: boolean;
    onPrevious?: () => void;
    onNext?: () => void;
  };
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  const body = (() => {
    if (error)
      return (
        <DataState
          kind="error"
          title={error.title}
          description={error.description}
          action={error.action}
        />
      );
    if (!isLoading && (!rows || rows.length === 0))
      return (
        <DataState
          kind="empty"
          title={empty?.title ?? "No hay nada para mostrar"}
          description={empty?.description}
          action={empty?.action}
        />
      );
    return (
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? [0, 1, 2].map((index) => (
                  <TableRow key={`skeleton-${index}`}>
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        <Skeleton className="h-4 w-full max-w-40" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows!.map((row) => (
                  <TableRow
                    key={getRowId(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(onRowClick && "cursor-pointer")}
                  >
                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        {column.cell
                          ? column.cell(row)
                          : String(
                              (row as Record<string, unknown>)[column.key] ??
                                "—",
                            )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    );
  })();

  return (
    <div className={className} aria-busy={isLoading || undefined}>
      {toolbar ? <DataToolbar {...toolbar} /> : null}
      {body}
      {pagination && !error && rows && rows.length > 0 ? (
        <DataPagination {...pagination} />
      ) : null}
    </div>
  );
}
