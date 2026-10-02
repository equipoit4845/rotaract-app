import { DetailItem } from "@/components/layout";

export function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return <DetailItem label={label}>{value}</DetailItem>;
}
