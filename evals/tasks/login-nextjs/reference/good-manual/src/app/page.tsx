import { cookies } from "next/headers";

import { unseal } from "@/lib/oidc";

export default async function Home() {
  const session = await unseal((await cookies()).get("session")?.value);
  const user = session?.user as { name?: string } | undefined;
  return (
    <main>
      <h1>{user ? `Hola, ${user.name}` : "Socios del club"}</h1>
      {!user && <a href="/auth/login">Ingresar con Mi Rotaract</a>}
    </main>
  );
}
