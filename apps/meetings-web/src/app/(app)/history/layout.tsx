"use client";

import { ProtectedAppLayout } from "@/components/auth/ProtectedAppLayout";
import { useAuthState } from "@/context/AuthContext";
import { ADMIN_ROLES, ROTARACT_ROLES } from "@/lib/permissions";
import type { Role } from "@/types/auth";

export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuthState();
  const backHref =
    user && ADMIN_ROLES.includes(user.role as Role)
      ? "/admin/meetings"
      : "/meetings";

  return (
    <ProtectedAppLayout
      title="Historial"
      allowRoles={ROTARACT_ROLES}
      backHref={backHref}
      backLabel="Volver"
    >
      {children}
    </ProtectedAppLayout>
  );
}
