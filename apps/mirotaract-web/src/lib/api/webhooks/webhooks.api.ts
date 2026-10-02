import { apiRequest, httpClient } from "../client/http-client";
import type {
  CreateWebhookEndpointRequest,
  EventCatalog,
  UpdateWebhookEndpointRequest,
  WebhookDelivery,
  WebhookDeliveryPage,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
} from "./webhooks.types";

/** One key per logical call (see developer-apps.api.ts). */
function idempotencyHeader() {
  return { "Idempotency-Key": crypto.randomUUID() };
}

type Path = { appId: string; endpointId: string };

export const webhooksApi = {
  catalog: (opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/events/catalog", { signal: opts?.signal }),
    ) as Promise<EventCatalog>,

  list: (appId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/developer/apps/{appId}/webhooks", {
        params: { path: { appId } },
        signal: opts?.signal,
      }),
    ) as Promise<WebhookEndpoint[]>,

  create: (appId: string, payload: CreateWebhookEndpointRequest) =>
    apiRequest(() =>
      httpClient.POST("/developer/apps/{appId}/webhooks", {
        params: { path: { appId }, header: idempotencyHeader() },
        body: payload,
      }),
    ) as Promise<WebhookEndpointWithSecret>,

  update: (path: Path, payload: UpdateWebhookEndpointRequest) =>
    apiRequest(() =>
      httpClient.PATCH("/developer/apps/{appId}/webhooks/{endpointId}", {
        params: { path, header: idempotencyHeader() },
        body: payload,
      }),
    ) as Promise<WebhookEndpoint>,

  remove: (path: Path) =>
    apiRequest(() =>
      httpClient.DELETE("/developer/apps/{appId}/webhooks/{endpointId}", {
        params: { path },
      }),
    ),

  rotateSecret: (path: Path) =>
    apiRequest(() =>
      httpClient.POST(
        "/developer/apps/{appId}/webhooks/{endpointId}/rotate-secret",
        { params: { path, header: idempotencyHeader() } },
      ),
    ) as Promise<WebhookEndpointWithSecret>,

  sendTest: (path: Path) =>
    apiRequest(() =>
      httpClient.POST("/developer/apps/{appId}/webhooks/{endpointId}/test", {
        params: { path },
      }),
    ) as Promise<WebhookDelivery>,

  deliveries: (
    path: Path,
    query: { status?: WebhookDeliveryStatus; cursor?: string; limit?: number },
    opts?: { signal?: AbortSignal },
  ) =>
    apiRequest(() =>
      httpClient.GET(
        "/developer/apps/{appId}/webhooks/{endpointId}/deliveries",
        { params: { path, query }, signal: opts?.signal },
      ),
    ) as Promise<WebhookDeliveryPage>,

  redeliver: (path: Path & { deliveryId: string }) =>
    apiRequest(() =>
      httpClient.POST(
        "/developer/apps/{appId}/webhooks/{endpointId}/deliveries/{deliveryId}/redeliver",
        { params: { path } },
      ),
    ) as Promise<WebhookDelivery>,
};
