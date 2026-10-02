import { miRotaractSession } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

/** GET /auth/login?returnTo=/padron → redirige a Mi Rotaract (PKCE + state + nonce en cookie cifrada). */
export function GET(request: Request) {
  return miRotaractSession().login(request);
}
