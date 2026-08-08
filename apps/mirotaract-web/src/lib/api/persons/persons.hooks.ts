"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { personsApi } from "./persons.api";
import { personKeys } from "./persons.keys";
import type {
  CreatePersonRequest,
  PersonFilters,
  UpdatePersonRequest,
} from "./persons.types";

export function usePersons(filters: Omit<PersonFilters, "cursor"> = {}) {
  return useInfiniteQuery({
    queryKey: personKeys.list(filters),
    queryFn: ({ pageParam, signal }) =>
      personsApi.list({ ...filters, cursor: pageParam }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo?.hasMore
        ? (lastPage.pageInfo?.nextCursor ?? undefined)
        : undefined,
  });
}

export function usePerson(personId: string | undefined) {
  return useQuery({
    queryKey: personKeys.detail(personId ?? ""),
    queryFn: ({ signal }) => personsApi.get(personId as string, { signal }),
    enabled: Boolean(personId),
  });
}

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePersonRequest) => personsApi.create(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: personKeys.lists() }),
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      personId,
      payload,
    }: {
      personId: string;
      payload: UpdatePersonRequest;
    }) => personsApi.update(personId, payload),
    onSuccess: (_data, { personId }) => {
      queryClient.invalidateQueries({ queryKey: personKeys.detail(personId) });
      queryClient.invalidateQueries({ queryKey: personKeys.lists() });
    },
  });
}

export function useArchivePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) => personsApi.archive(personId),
    onSuccess: (_data, personId) => {
      queryClient.invalidateQueries({ queryKey: personKeys.detail(personId) });
      queryClient.invalidateQueries({ queryKey: personKeys.lists() });
    },
  });
}

export function useInvitePerson() {
  return useMutation({
    mutationFn: ({
      personId,
      payload,
    }: {
      personId: string;
      payload: { membershipId: string; email: string };
    }) => personsApi.invite(personId, payload),
  });
}
