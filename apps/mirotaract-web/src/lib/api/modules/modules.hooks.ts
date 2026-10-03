"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authorizationKeys } from "../authorization/authorization.keys";
import { modulesApi } from "./modules.api";
import { moduleKeys } from "./modules.keys";
import type { ModuleStatus, RegisterModuleRequest } from "./modules.types";

/** Module catalog, read from (and authorized at) `organizationId`. */
export function useModules(
  organizationId: string | undefined,
  status?: ModuleStatus,
) {
  return useQuery({
    queryKey: moduleKeys.list(status, organizationId),
    queryFn: ({ signal }) =>
      modulesApi.list({ status, organizationId }, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useModule(
  moduleId: string | undefined,
  organizationId?: string,
) {
  return useQuery({
    queryKey: moduleKeys.detail(moduleId ?? ""),
    queryFn: ({ signal }) =>
      modulesApi.get(moduleId as string, organizationId, { signal }),
    enabled: Boolean(moduleId),
  });
}

export function useOrganizationModules(organizationId: string | undefined) {
  return useQuery({
    queryKey: moduleKeys.organizationInstallations(organizationId ?? ""),
    queryFn: ({ signal }) =>
      modulesApi.listOrganizationModules(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

/** District view: installations of the district and all its clubs. */
export function useModuleInstallationsInTree(
  organizationId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: moduleKeys.installationsInTree(organizationId ?? ""),
    queryFn: ({ signal }) =>
      modulesApi.listInstallationsInTree(
        organizationId as string,
        {},
        { signal },
      ),
    enabled: Boolean(organizationId) && (options.enabled ?? true),
  });
}

export function useOrganizationCapabilities(
  organizationId: string | undefined,
) {
  return useQuery({
    queryKey: moduleKeys.capabilities(organizationId ?? ""),
    queryFn: ({ signal }) =>
      modulesApi.organizationCapabilities(organizationId as string, { signal }),
    enabled: Boolean(organizationId),
  });
}

/** A new module brings new permissions: refresh the permission catalog too. */
function invalidateCatalog(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: moduleKeys.lists() });
  queryClient.invalidateQueries({ queryKey: authorizationKeys.all });
}

export function useRegisterModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterModuleRequest) =>
      modulesApi.register(payload),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateModuleManifest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      moduleId,
      manifest,
    }: {
      moduleId: string;
      manifest: Record<string, unknown>;
    }) => modulesApi.updateManifest(moduleId, manifest),
    onSuccess: (module_) => {
      queryClient.invalidateQueries({
        queryKey: moduleKeys.detail(module_.id),
      });
      invalidateCatalog(queryClient);
    },
  });
}

export function useDeprecateModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) => modulesApi.deprecate(moduleId),
    onSuccess: (module_) => {
      queryClient.invalidateQueries({
        queryKey: moduleKeys.detail(module_.id),
      });
      queryClient.invalidateQueries({ queryKey: moduleKeys.lists() });
    },
  });
}

function invalidateInstallation(
  queryClient: ReturnType<typeof useQueryClient>,
  organizationId: string,
) {
  queryClient.invalidateQueries({
    queryKey: moduleKeys.organizationInstallations(organizationId),
  });
  queryClient.invalidateQueries({
    queryKey: moduleKeys.capabilities(organizationId),
  });
  queryClient.invalidateQueries({
    queryKey: [...moduleKeys.all, "installationsInTree"],
  });
}

type InstallationTarget = { organizationId: string; moduleId: string };

export function useInstallModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      moduleId,
      configuration,
    }: InstallationTarget & {
      configuration?: Record<string, unknown> | null;
    }) => modulesApi.install(organizationId, moduleId, configuration),
    onSettled: (_installation, _error, { organizationId }) =>
      invalidateInstallation(queryClient, organizationId),
  });
}

export function useActivateModuleInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, moduleId }: InstallationTarget) =>
      modulesApi.activateInstallation(organizationId, moduleId),
    onSettled: (_installation, _error, { organizationId }) =>
      invalidateInstallation(queryClient, organizationId),
  });
}

export function useUpdateModuleConfiguration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      moduleId,
      configuration,
    }: InstallationTarget & { configuration: Record<string, unknown> }) =>
      modulesApi.updateConfiguration(organizationId, moduleId, configuration),
    onSuccess: (_installation, { organizationId }) =>
      invalidateInstallation(queryClient, organizationId),
  });
}

export function useSuspendModuleInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, moduleId }: InstallationTarget) =>
      modulesApi.suspendInstallation(organizationId, moduleId),
    onSuccess: (_installation, { organizationId }) =>
      invalidateInstallation(queryClient, organizationId),
  });
}

export function useDisableModuleInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, moduleId }: InstallationTarget) =>
      modulesApi.disableInstallation(organizationId, moduleId),
    onSuccess: (_installation, { organizationId }) =>
      invalidateInstallation(queryClient, organizationId),
  });
}
