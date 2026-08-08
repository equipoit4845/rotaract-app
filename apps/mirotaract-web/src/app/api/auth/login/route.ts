import { NextResponse } from "next/server";

import {
  kernelBaseUrl,
  setRefreshCookie,
} from "@/lib/api/client/session-cookie.server";

export async function POST(request: Request) {
  const credentials = await request.json();

  const kernelResponse = await fetch(`${kernelBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
  });

  if (!kernelResponse.ok) {
    return NextResponse.json(await kernelResponse.json(), {
      status: kernelResponse.status,
    });
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
