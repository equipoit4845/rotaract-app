'use client';

import { ProtectedAppLayout } from '@/components/auth/ProtectedAppLayout';
import { DISTRICT_ROLES } from '@/lib/permissions';

/** "Habilitación de clubes": SECRETARY / RDR / SUPERADMIN only. */
export default function ClubesAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedAppLayout title="" allowRoles={DISTRICT_ROLES} bare>
      {children}
    </ProtectedAppLayout>
  );
}
