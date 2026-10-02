import type { ReactNode } from "react";

import { AppProviders } from "../providers/Providers";

/** Authenticated screens: the middleware already ensured a session. */
export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AppProviders>{children}</AppProviders>;
}
