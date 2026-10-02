import { cookies } from "next/headers";
import Link from "next/link";

import { miRotaractSession } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  access_denied: "Cancelaste el ingreso.",
  login_expired: "El intento de ingreso venció. Probá de nuevo.",
  invalid_state: "El intento de ingreso no coincide (¿abriste dos pestañas?). Probá de nuevo.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await miRotaractSession().getSession(await cookies());

  if (!session)
    return (
      <>
        <h1>Bienvenida/o</h1>
        <p className="muted">Entrá con tu cuenta del distrito para ver el padrón de tu club.</p>
        {error && <p className="error">{ERRORS[error] ?? `No pudimos completar el ingreso (${error}).`}</p>}
        <a className="button" href="/auth/login?returnTo=/padron">
          Ingresar con Mi Rotaract
        </a>
      </>
    );

  const { user } = session;
  return (
    <>
      <h1>Hola, {user.given_name ?? user.name ?? "socio/a"}</h1>
      {user.email && <p className="muted">{user.email}</p>}
      <p>
        <Link className="button" href="/padron">
          Ver el padrón de mi club
        </Link>
      </p>
      <form action="/auth/logout" method="post">
        <button className="button secondary" type="submit">
          Salir
        </button>
      </form>
    </>
  );
}
