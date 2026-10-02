import { NextResponse } from "next/server";

import {
  clearRefreshCookie,
  forwardedClientHeaders,
  kernelBaseUrl,
} from "@/lib/api/client/session-cookie.server";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization) {
    await fetch(`${kernelBaseUrl()}/auth/logout-all`, {
      method: "POST",
      headers: { authorization, ...forwardedClientHeaders(request) },
    }).catch(() => undefined);
  }

  const response = new NextResponse(null, { status: 204 });
  clearRefreshCookie(response);
  return response;
}
