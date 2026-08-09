"use client";

import { ResetPasswordContainer } from "@/features/auth/containers/reset-password-container";
import { use } from "react";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  return <ResetPasswordContainer token={token} />;
}
