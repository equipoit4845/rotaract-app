import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { mr } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

export default async function Perfil() {
  const session = await mr().getSession(await cookies());
  if (!session) redirect("/auth/login?returnTo=/perfil");
  const clubs = session.user.memberships ?? [];
  return (
    <main>
      <h1>{session.user.name}</h1>
      <ul>
        {clubs.map((m) => (
          <li key={m.organizationId}>{m.organizationName}</li>
        ))}
      </ul>
    </main>
  );
}
