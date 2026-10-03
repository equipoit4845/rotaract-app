"use client";

import { useReviewHistory } from "@/lib/api";
import { Skeleton } from "@/components/ui";

import { formatDateTime } from "@/features/developer-apps/utils/app-catalog";

import { REVIEW_KIND_LABEL } from "../utils/governance-labels";

/** The app's review steps, newest first, with the RDR's reasons. */
export function ReviewHistory({ appId }: { appId: string }) {
  const history = useReviewHistory(appId);
  if (history.isLoading) return <Skeleton className="h-16" />;
  if (!history.data || history.data.length === 0)
    return <p className="text-sm text-muted-foreground">Sin movimientos.</p>;
  return (
    <ol className="space-y-3">
      {history.data.map((entry) => (
        <li key={entry.id} className="text-sm">
          <p>
            <span className="font-medium">
              {REVIEW_KIND_LABEL[entry.kind] ?? entry.kind}
            </span>{" "}
            <span className="text-muted-foreground">
              · {formatDateTime(entry.createdAt)}
              {entry.actorName ? ` · ${entry.actorName}` : ""}
            </span>
          </p>
          {entry.reason ? (
            <p className="mt-0.5 text-muted-foreground">“{entry.reason}”</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
