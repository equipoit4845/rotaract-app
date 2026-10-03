import { NextResponse, type NextRequest } from "next/server";

import { cookieOptions, exchange, seal, unseal, verifyIdToken } from "@/lib/oidc";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tx = await unseal(request.cookies.get("login_tx")?.value);
  const home = new URL("/", url);
  if (url.searchParams.get("error") === "access_denied") return NextResponse.redirect(new URL("/?error=cancelado", url));
  if (!tx || url.searchParams.get("state") !== tx.state) return NextResponse.redirect(new URL("/?error=state", url));
  try {
    const tokens = await exchange(url.searchParams.get("code") ?? "", String(tx.verifier));
    const claims = await verifyIdToken(tokens.id_token, String(tx.nonce));
    const response = NextResponse.redirect(home);
    response.cookies.delete("login_tx");
    const user = { sub: claims.sub, name: claims.name, memberships: claims.memberships ?? [] };
    response.cookies.set("session", await seal({ user }, 8 * 3600), { ...cookieOptions, maxAge: 8 * 3600 });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?error=login", url));
  }
}
