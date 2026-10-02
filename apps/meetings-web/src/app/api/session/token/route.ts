import { cookies } from "next/headers";

import { getMiRotaract } from "@/lib/server/mirotaract";
import { sessionTokenResponse } from "@/lib/server/token-route";

export const dynamic = "force-dynamic";

/** Mints the 15-minute meetings token from the encrypted session cookie. */
export async function GET() {
  const session = await getMiRotaract().getSession(await cookies());
  return sessionTokenResponse(session, process.env.MEETINGS_TOKEN_SECRET);
}
