import type { ReactNode } from "react";

import { ComposeProvider } from "@/components/mail/ComposeProvider";

/** Shared by every folder of a mailbox: the compose window survives navigation. */
export default function MailboxLayout({ children }: { children: ReactNode }) {
  return <ComposeProvider>{children}</ComposeProvider>;
}
