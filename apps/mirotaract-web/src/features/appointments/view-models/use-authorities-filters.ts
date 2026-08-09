"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/** Same `?organization=` convention as `useMembershipListFilters`/`useAppointmentListFilters`. */
export function useAuthoritiesFilters(): {
  organizationId: string | undefined;
  setOrganizationId: (value: string | undefined) => void;
} {
  const router = useRouter();
  const searchParams = useSearchParams();

  const organizationId = useMemo(
    () => searchParams.get("organization") ?? undefined,
    [searchParams],
  );

  const setOrganizationId = useCallback(
    (value: string | undefined) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set("organization", value);
      else next.delete("organization");
      const queryString = next.toString();
      router.replace(
        queryString ? `/authorities?${queryString}` : "/authorities",
      );
    },
    [router, searchParams],
  );

  return { organizationId, setOrganizationId };
}
