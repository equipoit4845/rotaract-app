import { notFound, redirect } from "next/navigation";

/**
 * The kernel's emails link to `/reset-password?token=…`; the screen lives at
 * `/reset-password/[token]`. Moves the token into the path, so links already sent
 * keep working.
 */
export default async function ResetPasswordQuery({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = Array.isArray(token) ? token[0] : token;
  if (!value || !/^[A-Za-z0-9_-]{16,256}$/.test(value)) notFound();
  redirect(`/reset-password/${value}`);
}
