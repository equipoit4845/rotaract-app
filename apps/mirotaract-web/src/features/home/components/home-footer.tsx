export function HomeFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--mr-space-1)",
        padding: "var(--mr-space-6)",
        borderTop: "1px solid var(--mr-color-border)",
        color: "var(--mr-color-text-muted)",
        fontSize: "0.875rem",
        textAlign: "center",
      }}
    >
      <span>Mi Rotaract — Rotaract Distrito 4845</span>
      <span>&copy; {year}</span>
    </footer>
  );
}
