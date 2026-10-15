"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell, ErrorNote } from "@/components/layout/AppShell";
import { slugOfView, type ThreadView } from "@/lib/inbox";
import { useApi } from "@/lib/use-api";

/** Old links `/bandeja/hilo/:threadId` → the conversation inside its folder. */
export default function ThreadRedirectPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();
  const { state } = useApi<ThreadView>(`/threads/${threadId}`);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const { mailboxId, folder } = state.data;
    router.replace(
      `/bandeja/${mailboxId}/${slugOfView(folder)}?hilo=${threadId}`,
    );
  }, [state, router, threadId]);

  return (
    <AppShell>
      {state.kind === "error" ? (
        <ErrorNote message={state.message} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Abriendo la conversación…
        </p>
      )}
    </AppShell>
  );
}
