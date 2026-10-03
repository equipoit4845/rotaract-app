"use client";

/**
 * REST client for meetings-api. Ported from the meetings part of the legacy
 * `apps/web/src/lib/api.ts`: same functions, same paths, same payloads —
 * only the base URL (`/meetings-api`) and the token source (the session
 * token manager instead of localStorage) changed.
 */

import { API_BASE } from "@/lib/config";
import { getToken, invalidateToken } from "@/lib/session-token";

const API_URL = API_BASE;

async function authorizedFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && retry) {
    // Token rejected (expired between refreshes, secret rotated...): mint a
    // fresh one from the session cookie and try once more.
    invalidateToken();
    await getToken({ force: true });
    return authorizedFetch(path, init, false);
  }
  return res;
}

async function errorMessage(res: Response): Promise<string> {
  const err = (await res.json().catch(() => ({}))) as { message?: unknown };
  const message = Array.isArray(err.message)
    ? err.message.join(", ")
    : err.message;
  return typeof message === "string" && message
    ? message
    : res.statusText || "Error";
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const res = await authorizedFetch(path, { ...options, headers });
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await authorizedFetch(path, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  return res.json();
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Auth (replaces legacy /auth/me for the meetings screens)
// ---------------------------------------------------------------------------

export type MeResponse = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  clubs: { id: string; name: string; isPresident: boolean }[];
};

export const authApi = {
  me: () => api<MeResponse | { user: MeResponse }>("/auth/me"),
};

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export const meetingsApi = {
  list: () => api<unknown[]>("/meetings"),
  downloadBulkTemplate: () =>
    downloadTemplate("/meetings/bulk/template", "plantilla-reuniones.csv"),
  bulkImport: (file: File, mode?: "partial" | "strict") =>
    bulkImportApi("/meetings/bulk", file, mode),
  downloadParticipantsBulkTemplate: (meetingId: string) =>
    downloadTemplate(
      `/meetings/${meetingId}/participants/bulk/template`,
      "plantilla-participantes-reunion.csv",
    ),
  bulkImportParticipants: (
    meetingId: string,
    file: File,
    mode?: "partial" | "strict",
  ) => bulkImportApi(`/meetings/${meetingId}/participants/bulk`, file, mode),
  get: (id: string) => api<unknown>(`/meetings/${id}`),
  create: (body: {
    title: string;
    description?: string;
    scheduledAt?: string;
    clubId: string;
    type?: string;
    isDistrictMeeting?: boolean;
  }) =>
    api<unknown>("/meetings", { method: "POST", body: JSON.stringify(body) }),
  update: (
    id: string,
    body: { title?: string; description?: string; scheduledAt?: string },
  ) =>
    api<unknown>(`/meetings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  start: (id: string) =>
    api<unknown>(`/meetings/${id}/start`, { method: "POST" }),
  pause: (id: string) =>
    api<unknown>(`/meetings/${id}/pause`, { method: "POST" }),
  resume: (id: string) =>
    api<unknown>(`/meetings/${id}/resume`, { method: "POST" }),
  finish: (id: string) =>
    api<unknown>(`/meetings/${id}/finish`, { method: "POST" }),
  lockAttendance: (id: string) =>
    api<unknown>(`/meetings/${id}/lock-attendance`, { method: "POST" }),
  toggleTranscription: (id: string, enabled: boolean) =>
    api<unknown>(`/meetings/${id}/transcription`, {
      method: "POST",
      body: JSON.stringify({ enabled }),
    }),
  schedule: (id: string) =>
    api<unknown>(`/meetings/${id}/schedule`, { method: "POST" }),
  assignParticipants: (
    id: string,
    participants: { userId: string; canVote?: boolean }[],
  ) =>
    api<unknown>(`/meetings/${id}/participants`, {
      method: "POST",
      body: JSON.stringify({ participants }),
    }),
  listAttachments: (id: string) =>
    api<{ id: string; fileName: string; sizeBytes?: number }[]>(
      `/meetings/${id}/attachments`,
    ),
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return postForm<unknown>(`/meetings/${id}/attachments`, form);
  },
  deleteAttachment: (meetingId: string, attachmentId: string) =>
    api<unknown>(`/meetings/${meetingId}/attachments/${attachmentId}`, {
      method: "DELETE",
    }),
  updateClubRepresentative: (
    meetingId: string,
    clubId: string,
    userId: string,
  ) =>
    api<{ message: string }>(
      `/meetings/${meetingId}/clubs/${clubId}/representative`,
      {
        method: "POST",
        body: JSON.stringify({ userId }),
      },
    ),
  removeClubAttendance: (meetingId: string, clubId: string) =>
    api<{ message: string }>(
      `/meetings/${meetingId}/clubs/${clubId}/attendance`,
      {
        method: "DELETE",
      },
    ),
};

/** Downloads an attachment with the bearer token (legacy `/attachments/:id/download`). */
export async function downloadAttachment(
  attachmentId: string,
): Promise<Blob | null> {
  const res = await authorizedFetch(`/attachments/${attachmentId}/download`);
  if (!res.ok) return null;
  return res.blob();
}

export const queueApi = {
  request: (meetingId: string) =>
    api<unknown>(`/meetings/${meetingId}/queue/request`, { method: "POST" }),
  cancel: (meetingId: string, requestId: string) =>
    api<unknown>(`/meetings/${meetingId}/queue/cancel`, {
      method: "POST",
      body: JSON.stringify({ requestId }),
    }),
  list: (meetingId: string) => api<unknown[]>(`/meetings/${meetingId}/queue`),
  state: (meetingId: string) =>
    api<{ queue: unknown[]; currentSpeaker: unknown; nextSpeaker: unknown }>(
      `/meetings/${meetingId}/queue/state`,
    ),
  setCurrentSpeaker: (meetingId: string, userId: string | null) =>
    api<unknown>(`/meetings/${meetingId}/queue/current-speaker`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  setNextSpeaker: (meetingId: string, userId: string | null) =>
    api<unknown>(`/meetings/${meetingId}/queue/next-speaker`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  releaseFloor: (meetingId: string) =>
    api<{ ok: boolean }>(`/meetings/${meetingId}/queue/release-floor`, {
      method: "POST",
    }),
};

export const votingApi = {
  open: (
    meetingId: string,
    topicId: string,
    options?: {
      votingMethod?: string;
      requiredMajority?: string;
      isElection?: boolean;
      ballotType?: "YES_NO" | "CANDIDATE";
      electionType?: string;
      candidates?: { displayName: string; userId?: string }[];
    },
  ) =>
    api<unknown>(`/meetings/${meetingId}/vote/open`, {
      method: "POST",
      body: JSON.stringify({ topicId, ...options }),
    }),
  close: (meetingId: string, voteSessionId: string) =>
    api<unknown>(`/meetings/${meetingId}/vote/close`, {
      method: "POST",
      body: JSON.stringify({ voteSessionId }),
    }),
  vote: (
    meetingId: string,
    voteSessionId: string,
    choice: "YES" | "NO" | "ABSTAIN",
    candidateId?: string,
  ) =>
    api<unknown>(`/meetings/${meetingId}/vote`, {
      method: "POST",
      body: JSON.stringify({ voteSessionId, choice, candidateId }),
    }),
  rdrTiebreaker: (
    meetingId: string,
    voteSessionId: string,
    choice: "YES" | "NO" | "ABSTAIN",
  ) =>
    api<unknown>(`/meetings/${meetingId}/vote/rdr-tiebreaker`, {
      method: "POST",
      body: JSON.stringify({ voteSessionId, choice }),
    }),
  rdrCandidateTiebreaker: (
    meetingId: string,
    voteSessionId: string,
    candidateId: string,
  ) =>
    api<unknown>(`/meetings/${meetingId}/vote/rdr-candidate-tiebreaker`, {
      method: "POST",
      body: JSON.stringify({ voteSessionId, candidateId }),
    }),
  openRunoff: (meetingId: string, previousSessionId: string) =>
    api<unknown>(`/meetings/${meetingId}/vote/runoff`, {
      method: "POST",
      body: JSON.stringify({ previousSessionId }),
    }),
  current: (meetingId: string) =>
    api<unknown>(`/meetings/${meetingId}/vote/current`),
  result: (meetingId: string, voteSessionId: string) =>
    api<unknown>(`/meetings/${meetingId}/vote/${voteSessionId}/result`),
  manual: (
    meetingId: string,
    voteSessionId: string,
    clubId: string,
    choice: "YES" | "NO" | "ABSTAIN",
    candidateId?: string,
  ) =>
    api<unknown>(`/meetings/${meetingId}/vote/manual`, {
      method: "POST",
      body: JSON.stringify({ voteSessionId, clubId, choice, candidateId }),
    }),
};

export const cartaPoderApi = {
  create: (
    meetingId: string,
    body: { clubId: string; delegateUserId: string; documentUrl?: string },
  ) =>
    api<unknown>(`/meetings/${meetingId}/carta-poder`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  list: (meetingId: string) =>
    api<unknown[]>(`/meetings/${meetingId}/carta-poder`),
  listMyClub: (meetingId: string, clubId: string) =>
    api<unknown[]>(`/meetings/${meetingId}/carta-poder/my-club/${clubId}`),
  verify: (meetingId: string, cpId: string) =>
    api<unknown>(`/meetings/${meetingId}/carta-poder/${cpId}/verify`, {
      method: "PATCH",
    }),
  reject: (meetingId: string, cpId: string, reason?: string) =>
    api<unknown>(`/meetings/${meetingId}/carta-poder/${cpId}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ reason }),
    }),
  remove: (meetingId: string, cpId: string) =>
    api<unknown>(`/meetings/${meetingId}/carta-poder/${cpId}`, {
      method: "DELETE",
    }),
};

export const topicsApi = {
  list: (meetingId: string) => api<unknown[]>(`/meetings/${meetingId}/topics`),
  create: (
    meetingId: string,
    body: {
      title: string;
      description?: string;
      order?: number;
      type?: string;
      estimatedDurationSec?: number;
    },
  ) =>
    api<unknown>(`/meetings/${meetingId}/topics`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (
    meetingId: string,
    topicId: string,
    body: {
      title?: string;
      description?: string;
      order?: number;
      type?: string;
      estimatedDurationSec?: number;
    },
  ) =>
    api<unknown>(`/meetings/${meetingId}/topics/${topicId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  delete: (meetingId: string, topicId: string) =>
    api<unknown>(`/meetings/${meetingId}/topics/${topicId}`, {
      method: "DELETE",
    }),
  reorder: (meetingId: string, topicIds: string[]) =>
    api<unknown[]>(`/meetings/${meetingId}/topics/reorder`, {
      method: "POST",
      body: JSON.stringify({ topicIds }),
    }),
  setCurrent: (meetingId: string, topicId: string | null) =>
    api<unknown>(`/meetings/${meetingId}/topics/current`, {
      method: "POST",
      body: JSON.stringify({ topicId }),
    }),
  downloadBulkTemplate: (meetingId: string) =>
    downloadTemplate(
      `/meetings/${meetingId}/topics/bulk/template`,
      "plantilla-agenda-reunion.csv",
    ),
  bulkImport: (meetingId: string, file: File, mode?: "partial" | "strict") =>
    bulkImportApi(`/meetings/${meetingId}/topics/bulk`, file, mode),
  addTranscription: (meetingId: string, topicId: string, text: string) =>
    api<unknown>(`/meetings/${meetingId}/topics/${topicId}/transcriptions`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  addTranscriptionAudio: (
    meetingId: string,
    topicId: string,
    audioBlob: Blob,
    filename = "audio.webm",
    speakerName?: string,
  ) => {
    const form = new FormData();
    form.append("file", audioBlob, filename);
    if (speakerName && speakerName.trim())
      form.append("speakerName", speakerName.trim());
    return postForm<unknown>(
      `/meetings/${meetingId}/topics/${topicId}/transcriptions/audio`,
      form,
    );
  },
};

export const motionsApi = {
  propose: (meetingId: string, title: string, description?: string) =>
    api<any>(`/meetings/${meetingId}/motions`, {
      method: "POST",
      body: JSON.stringify({ title, description }),
    }),
  second: (meetingId: string, motionId: string) =>
    api<any>(`/meetings/${meetingId}/motions/${motionId}/second`, {
      method: "POST",
    }),
  launchVote: (
    meetingId: string,
    motionId: string,
    body: {
      votingMethod: "PUBLIC" | "SECRET";
      requiredMajority: "SIMPLE" | "ABSOLUTE" | "TWO_THIRDS" | "THREE_QUARTERS";
    },
  ) =>
    api<any>(`/meetings/${meetingId}/motions/${motionId}/launch-vote`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

// ---------------------------------------------------------------------------
// Clubs, users and district lookups used by the admin screens
// ---------------------------------------------------------------------------

export type Club = {
  id: string;
  name: string;
  code: string;
  status: string;
  presidentEmail?: string | null;
  enabledForDistrictMeetings: boolean;
  cuotaAldia: boolean;
  informeAlDia: boolean;
  /** ClubStanding (meetings-api local table). */
  isConstituido?: boolean;
};

export type ClubStandingPatch = {
  isConstituido?: boolean;
  cuotaAldia?: boolean;
  informeAlDia?: boolean;
  enabledForDistrictMeetings?: boolean;
};

export type BulkImportResult = {
  total: number;
  created: number;
  failed: number;
  mode: "partial" | "strict";
  createdIds?: string[];
  errors: { row: number; data: Record<string, unknown>; message: string }[];
  reportCsv?: string;
};

async function bulkImportApi(
  path: string,
  file: File,
  mode?: "partial" | "strict",
): Promise<BulkImportResult> {
  const form = new FormData();
  form.append("file", file);
  const q = mode ? `?mode=${mode}` : "";
  return postForm<BulkImportResult>(`${path}${q}`, form);
}

async function downloadTemplate(path: string, filename: string): Promise<void> {
  const res = await authorizedFetch(path);
  if (!res.ok) throw new Error("Error al descargar plantilla");
  saveBlob(await res.blob(), filename);
}

export const clubsApi = {
  list: (includeInactive?: boolean) =>
    api<Club[]>(`/clubs${includeInactive ? "?includeInactive=true" : ""}`),
  get: (id: string) => api<Club>(`/clubs/${id}`),
  /**
   * Active members of a club (delegate picker; legacy used `/club/members`):
   * `GET /clubs/:id` returns the club with `authorities` = its active members.
   */
  members: async (clubId: string) => {
    const club = await api<{
      authorities?: { userId: string; fullName: string; email: string }[];
    }>(`/clubs/${clubId}`);
    return (club?.authorities ?? []).map((a) => ({
      id: a.userId,
      fullName: a.fullName,
      email: a.email,
    }));
  },
  /** "Habilitación de clubes": ClubStanding flags (SECRETARY/RDR/SUPERADMIN). */
  updateStanding: (id: string, body: ClubStandingPatch) =>
    api<Club>(`/clubs/${id}/standing`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
};

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  memberships: {
    clubId: string;
    title: string | null;
    isPresident: boolean;
    club: { id: string; name: string; code: string };
  }[];
};

export const usersApi = {
  list: () => api<AdminUser[]>("/users"),
};

export type ActiveTimer = {
  id: string;
  type: string;
  topicId: string;
  plannedDurationSec: number;
  startedAt: string;
  remainingSec: number;
  overtimeSec: number;
};

export const timersApi = {
  startTopic: (meetingId: string, topicId: string, durationSec: number) =>
    api<ActiveTimer>(`/meetings/${meetingId}/timers/topic/start`, {
      method: "POST",
      body: JSON.stringify({ topicId, durationSec }),
    }),
  stop: (meetingId: string, timerId: string) =>
    api<unknown>(`/meetings/${meetingId}/timers/stop`, {
      method: "POST",
      body: JSON.stringify({ timerId }),
    }),
  getActive: (meetingId: string) =>
    api<ActiveTimer | null>(`/meetings/${meetingId}/timers/active`),
};

export const districtApi = {
  clubs: {
    /** Club card with `authorities[{userId, fullName, email}]` (representative picker). */
    get: (id: string) => api<unknown>(`/district/clubs/${id}`),
  },
};

// ---------------------------------------------------------------------------
// History and acta
// ---------------------------------------------------------------------------

export const historyApi = {
  meetings: () => api<unknown[]>("/history/meetings"),
  meeting: (id: string) => api<unknown>(`/history/meetings/${id}`),
  audit: (meetingId: string) =>
    api<unknown[]>(`/history/meetings/${meetingId}/audit`),
  exportVotes: (meetingId: string) =>
    api<{ csv: string }>(`/history/meetings/${meetingId}/votes/export`),
  voteSessions: (meetingId: string) =>
    api<
      {
        id: string;
        topicId: string;
        topicTitle?: string;
        status: string;
        openedAt: string;
        closedAt?: string;
      }[]
    >(`/history/meetings/${meetingId}/votes`),
  downloadCsv: async (meetingId: string) => {
    const { csv } = await historyApi.exportVotes(meetingId);
    saveBlob(new Blob([csv], { type: "text/csv" }), `votes-${meetingId}.csv`);
  },
};

export const actaApi = {
  get: (meetingId: string) => api<unknown>(`/meetings/${meetingId}/acta`),
  generate: (meetingId: string) =>
    api<unknown>(`/meetings/${meetingId}/acta/generate`, { method: "POST" }),
  update: (meetingId: string, contentJson: string) =>
    api<unknown>(`/meetings/${meetingId}/acta`, {
      method: "PATCH",
      body: JSON.stringify({ contentJson }),
    }),
  publish: (meetingId: string) =>
    api<unknown>(`/meetings/${meetingId}/acta/publish`, { method: "POST" }),
  downloadPdf: async (meetingId: string) => {
    const res = await authorizedFetch(`/meetings/${meetingId}/acta/pdf`);
    if (!res.ok) throw new Error("Error al descargar PDF");
    saveBlob(await res.blob(), `acta-${meetingId}.pdf`);
  },
  autocompleteAI: (meetingId: string) =>
    api<unknown>(`/meetings/${meetingId}/acta/autocomplete-ai`, {
      method: "POST",
    }),
};
