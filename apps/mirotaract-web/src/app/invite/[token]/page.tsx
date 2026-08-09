"use client";

import { InviteAcceptContainer } from "@/features/auth/containers/invite-accept-container";
import { use } from "react";

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return <InviteAcceptContainer token={token} />;
}
