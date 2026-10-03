import { cookies } from "next/headers";
import Link from "next/link";

import { mr } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await mr().getSession(await cookies());
  if (!session)
    return (
      <main>
        <h1>Socios del club</h1>
        <a href="/auth/login?returnTo=/perfil">Ingresar con Mi Rotaract</a>
      </main>
    );
  return (
    <main>
      <h1>Hola, {session.user.name}</h1>
      <Link href="/perfil">Mi perfil</Link>
      <form action="/auth/logout" method="post">
        <button type="submit">Salir</button>
      </form>
    </main>
  );
}
