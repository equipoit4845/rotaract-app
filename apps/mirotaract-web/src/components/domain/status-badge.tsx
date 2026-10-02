import { Badge } from "@/components/ui";
import {
  statusLabel,
  statusTone,
  type StatusKind,
  type StatusOf,
} from "@/lib/status/status-catalog";

/** `<StatusBadge kind="membership" status={m.status} />` — label and tone come from the shared catalog. */
export function StatusBadge<K extends StatusKind>({
  kind,
  status,
  className,
}: {
  kind: K;
  status: StatusOf<K>;
  className?: string;
}) {
  return (
    <Badge tone={statusTone(kind, status)} className={className}>
      {statusLabel(kind, status)}
    </Badge>
  );
}
