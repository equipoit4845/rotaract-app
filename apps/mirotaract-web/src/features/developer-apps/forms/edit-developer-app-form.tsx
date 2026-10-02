"use client";

import type { DeveloperApp, UpdateDeveloperAppRequest } from "@/lib/api";
import { useUpdateDeveloperApp } from "@/lib/api";
import { Alert, Button, FormField, Input, Textarea } from "@/components/ui";
import { useState, type FormEvent } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { DataChoices, toggleInSet } from "../components/data-choices";
import {
  allowsLogin,
  allowsOwnAccess,
  APP_OWN_DATA,
  isAppOwnData,
  isLoginData,
  LOGIN_DATA,
  LOGIN_REQUIRED_DATA,
  parseRedirectUris,
  redirectUriProblem,
} from "../utils/app-catalog";

type Errors = Partial<
  Record<"name" | "description" | "ownData" | "redirectUris", string>
>;

/**
 * Name, description, data and redirect URIs. What the app *does* (its
 * grant types) is fixed at registration — kernel-openapi.yaml's
 * `UpdateDeveloperAppRequest` does not accept it — so only the data that
 * fits its current capabilities is offered.
 */
export function EditDeveloperAppForm({ app }: { app: DeveloperApp }) {
  const updateApp = useUpdateDeveloperApp();
  const login = allowsLogin(app);
  const ownAccess = allowsOwnAccess(app);

  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description ?? "");
  const [loginData, setLoginData] = useState<Set<string>>(
    () => new Set(app.scopes.filter(isLoginData)),
  );
  const [ownData, setOwnData] = useState<Set<string>>(
    () => new Set(app.scopes.filter(isAppOwnData)),
  );
  const [redirectUrisText, setRedirectUrisText] = useState(
    app.redirectUris.join("\n"),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      next.name = "El nombre tiene que tener entre 2 y 80 caracteres.";
    }
    if (description.trim().length > 500) {
      next.description = "La descripción puede tener hasta 500 caracteres.";
    }
    if (login) {
      const uris = parseRedirectUris(redirectUrisText);
      if (uris.length === 0) {
        next.redirectUris = "Dejá al menos una dirección de regreso.";
      } else {
        const problem = uris.map(redirectUriProblem).find(Boolean);
        if (problem) next.redirectUris = problem;
      }
    }
    if (ownAccess && ownData.size === 0) {
      next.ownData = "Elegí al menos un dato que la app pueda leer.";
    }
    return next;
  }

  function toRequest(): UpdateDeveloperAppRequest {
    const scopes = [
      ...(login ? [LOGIN_REQUIRED_DATA, ...loginData] : []),
      ...(ownAccess ? [...ownData] : []),
    ];
    return {
      name: name.trim(),
      description: description.trim() || null,
      scopes: [...new Set(scopes)],
      ...(login ? { redirectUris: parseRedirectUris(redirectUrisText) } : {}),
    };
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    updateApp.mutate(
      { appId: app.id, payload: toRequest() },
      { onSuccess: () => setSaved(true) },
    );
  }

  const serverError = updateApp.isError
    ? describeKernelError(updateApp.error)
    : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          label="Nombre"
          htmlFor="edit-app-name"
          required
          error={errors.name}
        >
          <Input
            id="edit-app-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField
          label="Descripción"
          htmlFor="edit-app-description"
          error={errors.description}
        >
          <Textarea
            id="edit-app-description"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
      </div>

      {login ? (
        <>
          <DataChoices
            idPrefix="edit-login-data"
            title="Datos de la persona que la app puede leer"
            description="Si agregás datos nuevos, cada persona los va a tener que aceptar la próxima vez que ingrese."
            items={LOGIN_DATA}
            selected={loginData}
            locked={[LOGIN_REQUIRED_DATA]}
            onToggle={(code, checked) =>
              setLoginData((current) => toggleInSet(current, code, checked))
            }
          />
          <FormField
            label="Direcciones de regreso"
            htmlFor="edit-app-redirect-uris"
            required
            error={errors.redirectUris}
            hint="Una por línea."
          >
            <Textarea
              id="edit-app-redirect-uris"
              rows={3}
              value={redirectUrisText}
              onChange={(event) => setRedirectUrisText(event.target.value)}
            />
          </FormField>
        </>
      ) : null}

      {ownAccess ? (
        <DataChoices
          idPrefix="edit-own-data"
          title="Datos del distrito que la app puede leer por su cuenta"
          items={APP_OWN_DATA}
          selected={ownData}
          error={errors.ownData}
          onToggle={(code, checked) =>
            setOwnData((current) => toggleInSet(current, code, checked))
          }
        />
      ) : null}

      {serverError ? (
        <Alert
          tone="danger"
          title={serverError.title}
          description={serverError.description}
        />
      ) : null}
      {saved && !updateApp.isPending ? (
        <Alert tone="success" title="Guardamos los cambios." />
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={updateApp.isPending}>
          {updateApp.isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
