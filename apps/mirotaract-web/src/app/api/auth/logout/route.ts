import { NextResponse } from "next/server";

import {
  clearRefreshCookie,
  kernelBaseUrl,
} from "@/lib/api/client/session-cookie.server";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization) {
    await fetch(`${kernelBaseUrl()}/auth/logout`, {
      method: "POST",
      headers: { authorization },
    }).catch(() => undefined);
  }

  const response = new NextResponse(null, { status: 204 });
  clearRefreshCookie(response);
  return response;
}
