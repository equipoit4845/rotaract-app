export function FieldRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <dt
        style={{
          fontSize: "0.75rem",
          color: "var(--mr-color-text-muted)",
          margin: 0,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0 }}>{value?.trim() ? value : "—"}</dd>
    </div>
  );
}
