"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { positionsApi } from "./positions.api";
import { positionKeys } from "./positions.keys";
import type {
  CreatePositionDefinitionRequest,
  OrganizationType,
  UpdatePositionDefinitionRequest,
} from "./positions.types";

export function usePositionDefinitions(organizationType?: OrganizationType) {
  return useQuery({
    queryKey: positionKeys.list(organizationType),
    queryFn: ({ signal }) => positionsApi.list(organizationType, { signal }),
  });
}

export function useCreatePositionDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePositionDefinitionRequest) =>
      positionsApi.create(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: positionKeys.lists() }),
  });
}

export function useUpdatePositionDefinition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      positionDefinitionId,
      payload,
    }: {
      positionDefinitionId: string;
      payload: UpdatePositionDefinitionRequest;
    }) => positionsApi.update(positionDefinitionId, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: positionKeys.lists() }),
  });
}

export function useAttachPermissionToPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      positionDefinitionId,
      permissionId,
    }: {
      positionDefinitionId: string;
      permissionId: string;
    }) => positionsApi.attachPermission(positionDefinitionId, permissionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: positionKeys.lists() }),
  });
}

export function useDetachPermissionFromPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      positionDefinitionId,
      permissionId,
    }: {
      positionDefinitionId: string;
      permissionId: string;
    }) => positionsApi.detachPermission(positionDefinitionId, permissionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: positionKeys.lists() }),
  });
}
