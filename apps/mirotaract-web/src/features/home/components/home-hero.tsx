import Link from "next/link";

export function HomeHero() {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "var(--mr-space-4)",
        padding: "var(--mr-space-8) var(--mr-space-6)",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.2 }}>
        Mi Rotaract
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: "1.125rem",
          color: "var(--mr-color-text-muted)",
        }}
      >
        Mi Rotaract centraliza la gestión institucional de clubes y distritos:
        organizaciones, personas, membresías, autoridades y períodos en un solo
        lugar.
      </p>
      <Link
        href="/login"
        className="mr-button mr-button--primary mr-button--lg"
        style={{ textDecoration: "none" }}
      >
        Ingresar
      </Link>
    </section>
  );
}
