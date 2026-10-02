"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { webhooksApi } from "./webhooks.api";
import { webhookKeys } from "./webhooks.keys";
import type {
  CreateWebhookEndpointRequest,
  UpdateWebhookEndpointRequest,
  WebhookDeliveryStatus,
} from "./webhooks.types";

/** Public catalog of event types (`GET /events/catalog`); changes only on deploys. */
export function useEventCatalog() {
  return useQuery({
    queryKey: webhookKeys.catalog(),
    queryFn: ({ signal }) => webhooksApi.catalog({ signal }),
    staleTime: 60 * 60_000,
  });
}

export function useWebhookEndpoints(appId: string | undefined) {
  return useQuery({
    queryKey: webhookKeys.list(appId ?? ""),
    queryFn: ({ signal }) => webhooksApi.list(appId as string, { signal }),
    enabled: Boolean(appId),
  });
}

/** Latest deliveries of an endpoint; polls while some are still pending. */
export function useWebhookDeliveries(
  appId: string,
  endpointId: string,
  status?: WebhookDeliveryStatus,
) {
  return useQuery({
    queryKey: [...webhookKeys.deliveries(appId, endpointId), status ?? "all"],
    queryFn: ({ signal }) =>
      webhooksApi.deliveries(
        { appId, endpointId },
        { status, limit: 25 },
        { signal },
      ),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === "PENDING")
        ? 5_000
        : false,
  });
}

function useRefreshEndpoints() {
  const queryClient = useQueryClient();
  return (appId: string) =>
    queryClient.invalidateQueries({ queryKey: webhookKeys.list(appId) });
}

/** The response carries the signing secret once; it never enters the cache. */
export function useCreateWebhookEndpoint() {
  const refresh = useRefreshEndpoints();
  return useMutation({
    mutationFn: ({
      appId,
      payload,
    }: {
      appId: string;
      payload: CreateWebhookEndpointRequest;
    }) => webhooksApi.create(appId, payload),
    onSuccess: (_created, { appId }) => refresh(appId),
  });
}

export function useUpdateWebhookEndpoint() {
  const refresh = useRefreshEndpoints();
  return useMutation({
    mutationFn: ({
      appId,
      endpointId,
      payload,
    }: {
      appId: string;
      endpointId: string;
      payload: UpdateWebhookEndpointRequest;
    }) => webhooksApi.update({ appId, endpointId }, payload),
    onSuccess: (_endpoint, { appId }) => refresh(appId),
  });
}

export function useDeleteWebhookEndpoint() {
  const refresh = useRefreshEndpoints();
  return useMutation({
    mutationFn: (path: { appId: string; endpointId: string }) =>
      webhooksApi.remove(path),
    onSuccess: (_data, { appId }) => refresh(appId),
  });
}

/** New secret, shown once. */
export function useRotateWebhookSecret() {
  const refresh = useRefreshEndpoints();
  return useMutation({
    mutationFn: (path: { appId: string; endpointId: string }) =>
      webhooksApi.rotateSecret(path),
    onSuccess: (_data, { appId }) => refresh(appId),
  });
}

function useRefreshDeliveries() {
  const queryClient = useQueryClient();
  return (appId: string, endpointId: string) =>
    queryClient.invalidateQueries({
      queryKey: webhookKeys.deliveries(appId, endpointId),
    });
}

export function useSendWebhookTest() {
  const refresh = useRefreshDeliveries();
  return useMutation({
    mutationFn: (path: { appId: string; endpointId: string }) =>
      webhooksApi.sendTest(path),
    onSuccess: (_delivery, { appId, endpointId }) => refresh(appId, endpointId),
  });
}

export function useRedeliverWebhook() {
  const refresh = useRefreshDeliveries();
  return useMutation({
    mutationFn: (path: {
      appId: string;
      endpointId: string;
      deliveryId: string;
    }) => webhooksApi.redeliver(path),
    onSuccess: (_delivery, { appId, endpointId }) => refresh(appId, endpointId),
  });
}
