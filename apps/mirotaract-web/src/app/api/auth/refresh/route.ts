import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  kernelBaseUrl,
  setRefreshCookie,
} from "@/lib/api/client/session-cookie.server";

export async function POST() {
  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json(
      { code: "NO_SESSION", title: "No session" },
      { status: 401 },
    );
  }

  const kernelResponse = await fetch(`${kernelBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!kernelResponse.ok) {
    const response = NextResponse.json(await kernelResponse.json(), {
      status: kernelResponse.status,
    });
    clearRefreshCookie(response);
    return response;
  }

  const tokens = await kernelResponse.json();
  const response = NextResponse.json({
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
  });
  setRefreshCookie(response, tokens.refreshToken);
  return response;
}
