"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useCompose } from "@/components/mail/ComposeProvider";

/** `/bandeja/:mailboxId/nuevo` (old links): opens the compose window over Recibidos. */
export default function NewMessagePage() {
  const { mailboxId } = useParams<{ mailboxId: string }>();
  const router = useRouter();
  const { openCompose } = useCompose();
  useEffect(() => {
    openCompose(mailboxId);
    router.replace(`/bandeja/${mailboxId}/recibidos`);
  }, [mailboxId, openCompose, router]);
  return null;
}
