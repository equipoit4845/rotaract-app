"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { developerAppsApi } from "./developer-apps.api";
import { developerAppKeys } from "./developer-apps.keys";
import type {
  CreateDeveloperAppRequest,
  DeveloperApp,
  UpdateDeveloperAppRequest,
} from "./developer-apps.types";

/** Apps registered for one organization (`GET /developer/apps?organizationId=`). */
export function useDeveloperApps(organizationId: string | undefined) {
  return useQuery({
    queryKey: developerAppKeys.list(organizationId ?? ""),
    queryFn: ({ signal }) =>
      developerAppsApi.list(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useDeveloperApp(appId: string | undefined) {
  return useQuery({
    queryKey: developerAppKeys.detail(appId ?? ""),
    queryFn: ({ signal }) => developerAppsApi.get(appId as string, { signal }),
    enabled: Boolean(appId),
  });
}

/** Writes the Kernel's response into the detail cache and refreshes every list. */
function useStoreApp() {
  const queryClient = useQueryClient();
  return (app: DeveloperApp) => {
    queryClient.setQueryData(developerAppKeys.detail(app.id), app);
    return queryClient.invalidateQueries({
      queryKey: developerAppKeys.lists(),
    });
  };
}

/**
 * The response carries `clientSecret` exactly once. It is handed to the
 * caller through `mutate`'s result and never written to the query cache.
 */
export function useCreateDeveloperApp() {
  const storeApp = useStoreApp();
  return useMutation({
    mutationFn: (payload: CreateDeveloperAppRequest) =>
      developerAppsApi.create(payload),
    onSuccess: (created) => storeApp(created.app),
  });
}

export function useUpdateDeveloperApp() {
  const storeApp = useStoreApp();
  return useMutation({
    mutationFn: ({
      appId,
      payload,
    }: {
      appId: string;
      payload: UpdateDeveloperAppRequest;
    }) => developerAppsApi.update(appId, payload),
    onSuccess: storeApp,
  });
}

/** New secret, shown once. The app detail is refetched for the updated secret list. */
export function useRotateDeveloperAppSecret() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appId: string) => developerAppsApi.rotateSecret(appId),
    onSuccess: (_secret, appId) =>
      queryClient.invalidateQueries({
        queryKey: developerAppKeys.detail(appId),
      }),
  });
}

export function useRevokeDeveloperAppSecret() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ appId, secretId }: { appId: string; secretId: string }) =>
      developerAppsApi.revokeSecret(appId, secretId),
    onSuccess: (_data, { appId }) =>
      queryClient.invalidateQueries({
        queryKey: developerAppKeys.detail(appId),
      }),
  });
}

export function useSuspendDeveloperApp() {
  const storeApp = useStoreApp();
  return useMutation({
    mutationFn: (appId: string) => developerAppsApi.suspend(appId),
    onSuccess: storeApp,
  });
}

export function useActivateDeveloperApp() {
  const storeApp = useStoreApp();
  return useMutation({
    mutationFn: (appId: string) => developerAppsApi.activate(appId),
    onSuccess: storeApp,
  });
}

export function useRevokeDeveloperApp() {
  const storeApp = useStoreApp();
  return useMutation({
    mutationFn: (appId: string) => developerAppsApi.revoke(appId),
    onSuccess: storeApp,
  });
}
