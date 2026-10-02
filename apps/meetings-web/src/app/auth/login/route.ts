import { getMiRotaract } from "@/lib/server/mirotaract";

export const dynamic = "force-dynamic";

/** GET /auth/login?returnTo=/ruta → "Ingresar con Mi Rotaract". */
export async function GET(request: Request) {
  try {
    return await getMiRotaract().login(request);
  } catch (error) {
    // Kernel unreachable (discovery) or misconfigured env: back to the landing.
    console.error(
      "[auth/login]",
      error instanceof Error ? error.message : error,
    );
    return new Response(null, {
      status: 302,
      headers: { location: "/?error=unavailable", "cache-control": "no-store" },
    });
  }
}
