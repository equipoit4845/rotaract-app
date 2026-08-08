import type { Meta, StoryObj } from "@storybook/react";

const swatches = [
  ["canvas", "--mr-color-canvas"],
  ["surface", "--mr-color-surface"],
  ["surface-muted", "--mr-color-surface-muted"],
  ["text", "--mr-color-text"],
  ["text-muted", "--mr-color-text-muted"],
  ["border", "--mr-color-border"],
  ["action", "--mr-color-action"],
  ["state-success", "--mr-color-state-success-text"],
  ["state-warning", "--mr-color-state-warning-text"],
  ["state-danger", "--mr-color-state-danger-text"],
  ["state-info", "--mr-color-state-info-text"],
] as const;

const meta: Meta = { title: "Foundations/Tokens" };
export default meta;

type Story = StoryObj;

export const ColorTokens: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gap: "0.75rem",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      }}
    >
      {swatches.map(([label, token]) => (
        <div
          key={token}
          style={{
            overflow: "hidden",
            border: "1px solid var(--mr-color-border)",
            borderRadius: "0.5rem",
          }}
        >
          <div style={{ height: 56, background: `var(${token})` }} />
          <div style={{ padding: "0.5rem", fontSize: "0.75rem" }}>
            <strong>{label}</strong>
            <div style={{ color: "var(--mr-color-text-muted)" }}>{token}</div>
          </div>
        </div>
      ))}
    </div>
  ),
};
