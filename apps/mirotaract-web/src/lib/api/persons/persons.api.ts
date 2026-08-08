import { apiRequest, httpClient } from "../client/http-client";
import type {
  AccountInvitation,
  CreatePersonRequest,
  Person,
  PersonFilters,
  PersonPage,
  UpdatePersonRequest,
} from "./persons.types";

export const personsApi = {
  list: (filters: PersonFilters, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/persons", {
        params: { query: filters },
        signal: opts?.signal,
      }),
    ) as Promise<PersonPage>,

  get: (personId: string, opts?: { signal?: AbortSignal }) =>
    apiRequest(() =>
      httpClient.GET("/persons/{personId}", {
        params: { path: { personId } },
        signal: opts?.signal,
      }),
    ) as Promise<Person>,

  create: (payload: CreatePersonRequest) =>
    apiRequest(() =>
      httpClient.POST("/persons", { body: payload }),
    ) as Promise<Person>,

  update: (personId: string, payload: UpdatePersonRequest) =>
    apiRequest(() =>
      httpClient.PATCH("/persons/{personId}", {
        params: { path: { personId } },
        body: payload,
      }),
    ) as Promise<Person>,

  archive: (personId: string) =>
    apiRequest(() =>
      httpClient.POST("/persons/{personId}/archive", {
        params: { path: { personId } },
      }),
    ) as Promise<Person>,

  invite: (
    personId: string,
    payload: { membershipId: string; email: string },
  ) =>
    apiRequest(() =>
      httpClient.POST("/persons/{personId}/invitations", {
        params: { path: { personId } },
        body: payload,
      }),
    ) as Promise<AccountInvitation>,
};
