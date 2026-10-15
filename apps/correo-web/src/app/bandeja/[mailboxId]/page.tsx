import { redirect } from "next/navigation";

/** `/bandeja/:mailboxId` → its Recibidos. */
export default async function MailboxPage({
  params,
}: {
  params: Promise<{ mailboxId: string }>;
}) {
  const { mailboxId } = await params;
  redirect(`/bandeja/${encodeURIComponent(mailboxId)}/recibidos`);
}
