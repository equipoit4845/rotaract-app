import type { Role } from '@/types/auth';

export const ADMIN_ROLES: Role[] = ['SECRETARY', 'PRESIDENT', 'RDR', 'SUPERADMIN'];

/** Roles con permisos para administrar el distrito */
export const DISTRICT_ROLES: Role[] = ['SECRETARY', 'RDR', 'SUPERADMIN'];

/** Todos los rotaractianos (excluye COMPANY) */
export const ROTARACT_ROLES: Role[] = ['PRESIDENT', 'RDR', 'PARTICIPANT', 'SECRETARY', 'SUPERADMIN'];

/**
 * Legacy sent authenticated users without the role to `/dashboard`
 * (`/talento` for COMPANY). This app has no dashboard: everyone lands on
 * "Mis reuniones".
 */
export function getDefaultRouteForRole(_role: Role): string {
  return '/meetings';
}

export type GuardDecision =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'login'; href: string }
  | { kind: 'redirect'; href: string }
  | { kind: 'allow' };

/**
 * The client-side role guard of the legacy `ProtectedAppLayout` /
 * `admin/meetings/layout.tsx`, as a pure function: while loading show the
 * skeleton; no user → login; role not allowed → default route; else allow.
 */
export function decideGuard(input: {
  user: { role: string } | null;
  isLoading: boolean;
  error?: string | null;
  allowRoles?: readonly string[];
  pathname: string;
  fallbackHref?: string;
}): GuardDecision {
  const { user, isLoading, error, allowRoles, pathname, fallbackHref } = input;
  if (isLoading) return { kind: 'loading' };
  if (!user) {
    if (error) return { kind: 'error', message: error };
    return { kind: 'login', href: `/auth/login?returnTo=${encodeURIComponent(pathname)}` };
  }
  if (allowRoles && !allowRoles.includes(user.role)) {
    return { kind: 'redirect', href: fallbackHref ?? getDefaultRouteForRole(user.role as Role) };
  }
  return { kind: 'allow' };
}

/** Sidebar entries visible to `role` (legacy nav-items.ts "Reuniones" group). */
export type MeetingsNavEntry = {
  href: string;
  label: string;
  roles?: readonly Role[];
};

export const MEETINGS_NAV: MeetingsNavEntry[] = [
  { href: '/meetings', label: 'Mis reuniones' },
  { href: '/admin/meetings', label: 'Administrar', roles: ['SECRETARY', 'RDR'] },
  { href: '/history', label: 'Historial' },
  { href: '/delegaciones', label: 'Delegaciones', roles: ['PRESIDENT'] },
  { href: '/admin/clubes', label: 'Habilitación de clubes', roles: ['SECRETARY', 'RDR'] },
];

/** Legacy rule: `roles` restricts an item; SUPERADMIN sees every item. */
export function visibleNav(role: string, entries: MeetingsNavEntry[] = MEETINGS_NAV): MeetingsNavEntry[] {
  return entries.filter(
    (entry) => !entry.roles || role === 'SUPERADMIN' || entry.roles.includes(role as Role),
  );
}

/** Longest-prefix match so `/admin/meetings/x` highlights "Administrar", not "Mis reuniones". */
export function activeNavHref(pathname: string, entries: MeetingsNavEntry[] = MEETINGS_NAV): string | null {
  let best: string | null = null;
  for (const entry of entries) {
    if (pathname === entry.href || pathname.startsWith(`${entry.href}/`)) {
      if (!best || entry.href.length > best.length) best = entry.href;
    }
  }
  return best;
}
