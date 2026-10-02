'use client';

import { ProtectedAppLayout } from '@/components/auth/ProtectedAppLayout';
import { DISTRICT_ROLES } from '@/lib/permissions';

/** Second guard (legacy): a PRESIDENT passes /admin but not /admin/meetings. */
export default function MeetingsAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedAppLayout title="" allowRoles={DISTRICT_ROLES} bare>
      {children}
    </ProtectedAppLayout>
  );
}
