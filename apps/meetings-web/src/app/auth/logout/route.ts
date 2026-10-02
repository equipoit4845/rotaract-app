import { getMiRotaract } from '@/lib/server/mirotaract';

export const dynamic = 'force-dynamic';

/** POST /auth/logout (form in the account menu) → clears the session cookie. */
export function POST(request: Request) {
  return getMiRotaract().logout(request);
}

/** GET kept for plain links; logging out is harmless if forged. */
export function GET(request: Request) {
  return getMiRotaract().logout(request);
}
