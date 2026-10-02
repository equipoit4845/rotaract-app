'use client';

import { useQuery } from '@tanstack/react-query';
import { clubsApi, meetingsApi, topicsApi } from '@/lib/api';

export const queryKeys = {
  meetings: ['meetings'] as const,
  meetingDetail: (id: string) => ['meetings', id] as const,
  meetingTopics: (id: string) => ['meetings', id, 'topics'] as const,
  clubsList: (includeInactive = false) => ['clubs', includeInactive] as const,
};

export function useMeetingsQuery() {
  return useQuery({
    queryKey: queryKeys.meetings,
    queryFn: () => meetingsApi.list(),
  });
}

export function useMeetingDetailQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.meetingDetail(id),
    queryFn: () => meetingsApi.get(id),
    enabled: !!id,
  });
}

export function useMeetingTopicsQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.meetingTopics(id),
    queryFn: () => topicsApi.list(id),
    enabled: !!id,
  });
}

export function useClubsListQuery(includeInactive = false, enabled = true) {
  return useQuery({
    queryKey: queryKeys.clubsList(includeInactive),
    queryFn: () => clubsApi.list(includeInactive),
    enabled,
  });
}
