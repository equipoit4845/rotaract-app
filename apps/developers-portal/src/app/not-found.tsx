import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        No encontramos esa página
      </h1>
      <p className="mt-3 text-muted-foreground">
        Probá con el buscador de arriba o volvé a las guías.
      </p>
      <Link
        href="/docs"
        className="mt-8 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
      >
        Ir a las guías
      </Link>
    </div>
  );
}
