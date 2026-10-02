import { MiRotaractOAuthError } from "@mirotaract/sdk";

import { rostersFor } from "@/lib/clubs";
import { mobileTokenVerifier } from "@/lib/mirotaract";

export const dynamic = "force-dynamic";

function unauthorized(description: string) {
  return Response.json(
    { error: "invalid_token", error_description: description },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' } },
  );
}

/**
 * GET /api/members con `Authorization: Bearer <access_token>` de TU app
 * móvil/SPA (PUBLIC, plantilla flutter). El token se verifica con el JWKS
 * (firma, emisor, audiencia, que sea de tu app) y contra /oauth/userinfo
 * (ve revocaciones al instante). La lista sale de la API de datos con el
 * token de servicio de este servidor: la app móvil nunca tiene secretos.
 */
export async function GET(request: Request) {
  const verifier = mobileTokenVerifier();
  if (!verifier)
    return Response.json({ error: "not_configured", error_description: "Falta MIROTARACT_PUBLIC_CLIENT_ID" }, { status: 501 });
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return unauthorized("Falta el token Bearer");
  let personId: string;
  try {
    const claims = await verifier.verifyAccessToken(token);
    await verifier.userInfo(token);
    personId = claims.sub;
  } catch (error) {
    if (error instanceof MiRotaractOAuthError) return unauthorized("Token inválido o vencido");
    throw error;
  }
  const rosters = await rostersFor(personId);
  return Response.json(
    {
      clubs: rosters.map(({ club, members }) => ({
        organizationId: club.organizationId,
        name: club.organizationName,
        members: members.map((m) => ({
          membershipId: m.membershipId,
          displayName: m.person.displayName,
          memberNumber: m.memberNumber ?? null,
          status: m.status,
        })),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
