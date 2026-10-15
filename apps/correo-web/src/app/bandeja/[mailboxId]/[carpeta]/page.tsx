import { Suspense } from "react";

import { MailApp } from "@/components/mail/MailApp";

/** `/bandeja/:mailboxId/:carpeta?hilo=:threadId` — the inbox. */
export default async function MailboxFolderPage({
  params,
}: {
  params: Promise<{ mailboxId: string; carpeta: string }>;
}) {
  const { mailboxId, carpeta } = await params;
  return (
    <Suspense>
      <MailApp mailboxId={mailboxId} slug={carpeta} />
    </Suspense>
  );
}
