"use client";

import { VerifyEmailContainer } from "@/features/auth/containers/verify-email-container";
import { use } from "react";

export default function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return <VerifyEmailContainer token={token} />;
}
