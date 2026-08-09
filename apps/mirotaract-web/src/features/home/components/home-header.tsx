import { Logo } from "@equipoit4845/icons";
import Link from "next/link";

export function HomeHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--mr-space-4) var(--mr-space-6)",
        borderBottom: "1px solid var(--mr-color-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--mr-space-2)",
          fontWeight: 600,
        }}
      >
        <Logo size={24} />
        Mi Rotaract
      </div>
      <Link
        href="/login"
        className="mr-button mr-button--primary mr-button--md"
        style={{ textDecoration: "none" }}
      >
        Ingresar
      </Link>
    </header>
  );
}
