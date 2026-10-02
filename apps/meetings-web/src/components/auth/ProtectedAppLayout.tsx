'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell, AppShellSkeleton } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthActions, useAuthState } from '@/context/AuthContext';
import { decideGuard } from '@/lib/permissions';

type ProtectedAppLayoutProps = {
  title: string;
  allowRoles?: string[];
  /** Fallback for authenticated users without an allowed role (default `/meetings`). */
  fallbackHref?: string;
  backHref?: string;
  backLabel?: string;
  /** Render the children without the AppShell (nested guards). */
  bare?: boolean;
  children: ReactNode;
};

/** Port of the legacy client-side guard (`components/auth/ProtectedAppLayout.tsx`). */
export function ProtectedAppLayout({
  title,
  allowRoles,
  fallbackHref,
  backHref,
  backLabel,
  bare = false,
  children,
}: ProtectedAppLayoutProps) {
  const { user, isLoading, error } = useAuthState();
  const { reload } = useAuthActions();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const decision = decideGuard({ user, isLoading, error, allowRoles, pathname, fallbackHref });

  useEffect(() => {
    if (decision.kind === 'login') window.location.assign(decision.href);
    if (decision.kind === 'redirect') router.replace(decision.href);
  }, [decision.kind, decision.kind === 'login' || decision.kind === 'redirect' ? decision.href : '', router]);

  if (decision.kind === 'error') {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <Card className="w-full max-w-md border-destructive">
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium text-destructive">
              No se pudo conectar con el servidor de reuniones.
            </p>
            <p className="text-xs text-muted-foreground">{decision.message}</p>
            <Button size="sm" variant="outline" onClick={reload}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (decision.kind !== 'allow' || !user) {
    return bare ? null : <AppShellSkeleton />;
  }

  if (bare) return <>{children}</>;

  return (
    <AppShell title={title} user={user} backHref={backHref} backLabel={backLabel}>
      {children}
    </AppShell>
  );
}
