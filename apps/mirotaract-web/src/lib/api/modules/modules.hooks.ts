"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { modulesApi } from "./modules.api";
import { moduleKeys } from "./modules.keys";
import type { CreateModuleRequest, ModuleStatus } from "./modules.types";

export function useModules(status?: ModuleStatus) {
  return useQuery({
    queryKey: moduleKeys.list(status),
    queryFn: ({ signal }) => modulesApi.list(status, { signal }),
  });
}

export function useModule(moduleId: string | undefined) {
  return useQuery({
    queryKey: moduleKeys.detail(moduleId ?? ""),
    queryFn: ({ signal }) => modulesApi.get(moduleId as string, { signal }),
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

export function useRegisterModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateModuleRequest) => modulesApi.register(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: moduleKeys.lists() }),
  });
}

export function useUpdateModuleManifest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      moduleId,
      payload,
    }: {
      moduleId: string;
      payload: {
        manifest: Record<string, unknown>;
        configurationSchema?: Record<string, unknown> | null;
      };
    }) => modulesApi.updateManifest(moduleId, payload),
    onSuccess: (module_) => {
      queryClient.invalidateQueries({
        queryKey: moduleKeys.detail(module_.id),
      });
      queryClient.invalidateQueries({ queryKey: moduleKeys.lists() });
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
}

export function useInstallModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      moduleId,
      configuration,
    }: {
      organizationId: string;
      moduleId: string;
      configuration?: Record<string, unknown> | null;
    }) => modulesApi.install(organizationId, moduleId, configuration),
    onSuccess: (_installation, { organizationId }) =>
      invalidateInstallation(queryClient, organizationId),
  });
}

export function useActivateModuleInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      moduleId,
    }: {
      organizationId: string;
      moduleId: string;
    }) => modulesApi.activateInstallation(organizationId, moduleId),
    onSuccess: (_installation, { organizationId }) =>
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
    }: {
      organizationId: string;
      moduleId: string;
      configuration: Record<string, unknown>;
    }) =>
      modulesApi.updateConfiguration(organizationId, moduleId, configuration),
    onSuccess: (_installation, { organizationId }) =>
      invalidateInstallation(queryClient, organizationId),
  });
}

export function useSuspendModuleInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      moduleId,
    }: {
      organizationId: string;
      moduleId: string;
    }) => modulesApi.suspendInstallation(organizationId, moduleId),
    onSuccess: (_installation, { organizationId }) =>
      invalidateInstallation(queryClient, organizationId),
  });
}

export function useDisableModuleInstallation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      moduleId,
    }: {
      organizationId: string;
      moduleId: string;
    }) => modulesApi.disableInstallation(organizationId, moduleId),
    onSuccess: (_installation, { organizationId }) =>
      invalidateInstallation(queryClient, organizationId),
  });
}
