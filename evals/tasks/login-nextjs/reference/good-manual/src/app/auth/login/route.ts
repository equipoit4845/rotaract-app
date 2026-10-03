import { NextResponse } from "next/server";

import { authorizeUrl, cookieOptions, random, seal } from "@/lib/oidc";

export async function GET() {
  const state = random();
  const nonce = random();
  const verifier = random();
  const response = NextResponse.redirect(authorizeUrl(state, nonce, verifier));
  response.cookies.set("login_tx", await seal({ state, nonce, verifier }, 600), { ...cookieOptions, maxAge: 600 });
  return response;
}
