import { mintMeetingsToken } from "./meetings-token";

type SessionLike = {
  user: { sub: string; name?: string; email?: string };
} | null;

const noStore = { "cache-control": "no-store" };

/**
 * `GET /api/session/token`: 401 without a session, otherwise
 * `{ token, expiresAt }`. Kept free of Next imports so it can be unit-tested.
 */
export async function sessionTokenResponse(
  session: SessionLike,
  secret: string | undefined,
  now: number = Date.now(),
): Promise<Response> {
  if (!session) {
    return Response.json(
      { error: "unauthenticated" },
      { status: 401, headers: noStore },
    );
  }
  try {
    const minted = await mintMeetingsToken(
      {
        sub: session.user.sub,
        name: session.user.name,
        email: session.user.email,
      },
      secret,
      now,
    );
    return Response.json(minted, { headers: noStore });
  } catch (error) {
    console.error(
      "[session/token]",
      error instanceof Error ? error.message : error,
    );
    return Response.json(
      { error: "token_unavailable" },
      { status: 500, headers: noStore },
    );
  }
}
