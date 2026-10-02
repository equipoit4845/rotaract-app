import { getMiRotaract } from '@/lib/server/mirotaract';

export const dynamic = 'force-dynamic';

/** GET /auth/login?returnTo=/ruta → "Ingresar con Mi Rotaract". */
export function GET(request: Request) {
  return getMiRotaract().login(request);
}
