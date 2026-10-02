'use client';

import { ProtectedAppLayout } from '@/components/auth/ProtectedAppLayout';
import { ROTARACT_ROLES } from '@/lib/permissions';

/** Legacy `/club/delegaciones` (Mi Club → Delegaciones, PRESIDENT). */
export default function DelegacionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedAppLayout title="Delegaciones" allowRoles={ROTARACT_ROLES}>
      {children}
    </ProtectedAppLayout>
  );
}
