import { getMiRotaract } from '@/lib/server/mirotaract';

export const dynamic = 'force-dynamic';

/** GET /auth/callback → code exchange, session cookie, redirect to returnTo. */
export function GET(request: Request) {
  return getMiRotaract().callback(request);
}
