import { miRotaractSession } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

/** GET /auth/callback: valida state, canjea el código, verifica el id_token (JWKS) y crea la sesión. */
export function GET(request: Request) {
  return miRotaractSession().callback(request);
}
