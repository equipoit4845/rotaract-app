"use client";

import { API_BASE } from "@/lib/config";
import { getToken, invalidateToken } from "@/lib/session-token";

/** Error with the Spanish message correo-api sent, when there is one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * GET/POST to correo-api with the in-memory correo token; one retry on 401.
 * A string body is sent as JSON; a FormData body (attachments) keeps the
 * multipart content type the browser sets.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const token = await getToken({ force: attempt > 0 });
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(typeof init.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (res.status === 401 && attempt === 0) {
      invalidateToken();
      continue;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      const message =
        typeof body?.message === "string"
          ? body.message
          : res.status === 413
            ? "Los adjuntos son demasiado grandes."
            : "Algo salió mal. Probá de nuevo.";
      throw new ApiError(res.status, message);
    }
    return (await res.json()) as T;
  }
}

export type MailboxSummary = {
  id: string;
  kind: "PERSONAL" | "ROLE";
  address: string;
  displayName: string;
  positionCode: string;
  status: "ACTIVE" | "READ_ONLY" | "CLOSED";
  closesAt: string | null;
  /** false while ClickMail still has to set it up. */
  ready: boolean;
  /** Unread conversations in Recibidos. */
  unread: number;
};

export type Me = {
  personId: string;
  name: string | null;
  canUse: boolean;
  canManage: boolean;
  mailboxes: MailboxSummary[];
};
