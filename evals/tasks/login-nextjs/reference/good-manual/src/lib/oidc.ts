import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createRemoteJWKSet, EncryptJWT, jwtDecrypt, jwtVerify } from "jose";

const ISSUER = process.env.MIROTARACT_ISSUER!;
const CLIENT_ID = process.env.MIROTARACT_CLIENT_ID!;
export const REDIRECT_URI = `${process.env.APP_URL}/auth/callback`;
export const LOGIN_SCOPE = "openid profile memberships";
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
const key = createHash("sha256").update(process.env.SESSION_SECRET!).digest();

export const random = () => randomBytes(32).toString("base64url");
export const challenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.APP_URL!.startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
};

export async function seal(payload: Record<string, unknown>, maxAgeSec: number) {
  return new EncryptJWT(payload).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setExpirationTime(`${maxAgeSec}s`).encrypt(key);
}

export async function unseal(value: string | undefined) {
  if (!value) return null;
  try {
    return (await jwtDecrypt(value, key)).payload;
  } catch {
    return null;
  }
}

export async function exchange(code: string, verifier: string) {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${process.env.MIROTARACT_CLIENT_SECRET}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier }),
  });
  if (!response.ok) throw new Error(`token endpoint: HTTP ${response.status}`);
  return (await response.json()) as { id_token: string };
}

export async function verifyIdToken(idToken: string, nonce: string) {
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: ISSUER,
    audience: CLIENT_ID,
    algorithms: ["ES256"],
  });
  if (payload.nonce !== nonce) throw new Error("nonce inválido");
  return payload;
}

export const authorizeUrl = (state: string, nonce: string, verifier: string) =>
  `${ISSUER.replace(/\/api\/kernel\/v1$/, "")}/oauth/authorize?` +
  new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: LOGIN_SCOPE,
    state,
    nonce,
    code_challenge: challenge(verifier),
    code_challenge_method: "S256",
  }).toString();
