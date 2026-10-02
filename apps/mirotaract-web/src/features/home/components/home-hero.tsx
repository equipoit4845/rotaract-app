import { buttonVariants } from "@/components/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function HomeHero() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 md:pb-28 md:pt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[28rem] max-w-4xl rounded-full bg-primary/15 blur-3xl"
      />
      <div className="mx-auto max-w-4xl text-center">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-primary">
          Plataforma institucional · Distrito 4845
        </p>
        <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground text-balance md:text-5xl lg:text-6xl">
          La gestión de tu club, clara y conectada.
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground text-pretty">
          Mi Rotaract centraliza la gestión institucional de clubes y distritos:
          organizaciones, personas, membresías, autoridades y períodos en un
          solo lugar.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className={buttonVariants({
              size: "xl",
              className: "w-full shadow-lg shadow-primary/20 sm:w-auto",
            })}
          >
            Ingresar a la plataforma
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <a
            href="#capacidades"
            className={buttonVariants({
              variant: "outline",
              size: "xl",
              className: "w-full sm:w-auto",
            })}
          >
            Conocé más
          </a>
        </div>
      </div>
    </section>
  );
}
