"use client";

import type {
  CreateDeveloperAppRequest,
  CreatedDeveloperApp,
  DeveloperAppGrantType,
  DeveloperAppType,
  Organization,
} from "@/lib/api";
import { useCreateDeveloperApp } from "@/lib/api";
import { FormSection } from "@/components/layout";
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  FormFieldError,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { useState, type FormEvent } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { DataChoices, toggleInSet } from "../components/data-choices";
import {
  APP_OWN_DATA,
  APP_TYPE_HINT,
  APP_TYPE_LABEL,
  CAPABILITY,
  LOGIN_DATA,
  LOGIN_REQUIRED_DATA,
  parseRedirectUris,
  redirectUriProblem,
} from "../utils/app-catalog";

type Errors = Partial<
  Record<
    | "name"
    | "description"
    | "organizationId"
    | "capabilities"
    | "loginData"
    | "ownData"
    | "redirectUris",
    string
  >
>;

/**
 * Register a new app. The district picks what the app *does* in plain
 * language; this maps it to the Kernel's grant types and scopes. The
 * checks here mirror docs/11-developer-platform-auth.md so typos are
 * caught early, but the Kernel decides — its 400 is shown as-is.
 */
export function CreateDeveloperAppForm({
  organizations,
  defaultOrganizationId,
  onCreated,
  onCancel,
}: {
  organizations: Organization[];
  defaultOrganizationId: string | undefined;
  onCreated: (created: CreatedDeveloperApp) => void;
  onCancel: () => void;
}) {
  const createApp = useCreateDeveloperApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [organizationId, setOrganizationId] = useState(
    defaultOrganizationId ?? "",
  );
  const [type, setType] = useState<DeveloperAppType>("CONFIDENTIAL");
  const [login, setLogin] = useState(true);
  const [ownAccess, setOwnAccess] = useState(false);
  const [loginData, setLoginData] = useState<Set<string>>(
    () => new Set([LOGIN_REQUIRED_DATA, "profile", "email"]),
  );
  const [ownData, setOwnData] = useState<Set<string>>(() => new Set());
  const [redirectUrisText, setRedirectUrisText] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const ownAccessAvailable = type === "CONFIDENTIAL";
  const usesOwnAccess = ownAccessAvailable && ownAccess;

  function validate(): Errors {
    const next: Errors = {};
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      next.name = "El nombre tiene que tener entre 2 y 80 caracteres.";
    }
    if (description.trim().length > 500) {
      next.description = "La descripción puede tener hasta 500 caracteres.";
    }
    if (!organizationId) next.organizationId = "Elegí la organización.";
    if (!login && !usesOwnAccess) {
      next.capabilities = "Elegí al menos una cosa que la app pueda hacer.";
    }
    if (login) {
      const uris = parseRedirectUris(redirectUrisText);
      if (uris.length === 0) {
        next.redirectUris =
          "Agregá al menos una dirección de regreso para que las personas puedan ingresar.";
      } else {
        const problem = uris.map(redirectUriProblem).find(Boolean);
        if (problem) next.redirectUris = problem;
      }
    }
    if (usesOwnAccess && ownData.size === 0) {
      next.ownData = "Elegí al menos un dato que la app pueda leer.";
    }
    return next;
  }

  function toRequest(): CreateDeveloperAppRequest {
    const grantTypes: DeveloperAppGrantType[] = [
      ...(login ? CAPABILITY.login.grants : []),
      ...(usesOwnAccess ? CAPABILITY.ownAccess.grants : []),
    ];
    const scopes = [
      ...(login ? [LOGIN_REQUIRED_DATA, ...loginData] : []),
      ...(usesOwnAccess ? [...ownData] : []),
    ];
    return {
      name: name.trim(),
      description: description.trim() || null,
      organizationId,
      type,
      grantTypes,
      scopes: [...new Set(scopes)],
      redirectUris: login ? parseRedirectUris(redirectUrisText) : [],
    };
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    createApp.mutate(toRequest(), { onSuccess: onCreated });
  }

  const serverError = createApp.isError
    ? describeKernelError(createApp.error)
    : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormSection title="Datos de la app">
        <FormField
          label="Nombre"
          htmlFor="app-name"
          required
          error={errors.name}
          hint="Es lo que van a ver las personas cuando la app les pida permiso."
        >
          <Input
            id="app-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField
          label="Descripción"
          htmlFor="app-description"
          error={errors.description}
        >
          <Textarea
            id="app-description"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        <FormField
          label="Organización"
          htmlFor="app-organization"
          required
          error={errors.organizationId}
          hint="La app solo va a ver datos de esta organización (y de sus clubes, si es el distrito)."
        >
          <Select
            id="app-organization"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          >
            <option value="">Elegí una organización</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Tipo"
          htmlFor="app-type"
          required
          hint={APP_TYPE_HINT[type]}
        >
          <Select
            id="app-type"
            value={type}
            onChange={(event) =>
              setType(event.target.value as DeveloperAppType)
            }
          >
            <option value="CONFIDENTIAL">{APP_TYPE_LABEL.CONFIDENTIAL}</option>
            <option value="PUBLIC">{APP_TYPE_LABEL.PUBLIC}</option>
          </Select>
        </FormField>
      </FormSection>

      <FormSection title="Qué puede hacer la app">
        <div className="space-y-2">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={login}
              onCheckedChange={(checked) => setLogin(checked === true)}
            />
            {CAPABILITY.login.label}
          </label>
          {ownAccessAvailable ? (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={ownAccess}
                onCheckedChange={(checked) => setOwnAccess(checked === true)}
              />
              {CAPABILITY.ownAccess.label}
            </label>
          ) : null}
          {errors.capabilities ? (
            <FormFieldError>{errors.capabilities}</FormFieldError>
          ) : null}
        </div>
      </FormSection>

      {login ? (
        <>
          <DataChoices
            idPrefix="login-data"
            title="Datos de la persona que la app puede leer"
            description="Se los pedimos a cada persona la primera vez que ingresa."
            items={LOGIN_DATA}
            selected={loginData}
            locked={[LOGIN_REQUIRED_DATA]}
            error={errors.loginData}
            onToggle={(code, checked) =>
              setLoginData((current) => toggleInSet(current, code, checked))
            }
          />
          <FormField
            label="Direcciones de regreso"
            htmlFor="app-redirect-uris"
            required
            error={errors.redirectUris}
            hint="Una por línea. Adonde vuelve la persona después de ingresar, por ejemplo https://miapp.org/callback."
          >
            <Textarea
              id="app-redirect-uris"
              rows={3}
              value={redirectUrisText}
              onChange={(event) => setRedirectUrisText(event.target.value)}
            />
          </FormField>
        </>
      ) : null}

      {usesOwnAccess ? (
        <DataChoices
          idPrefix="own-data"
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

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={createApp.isPending}>
          {createApp.isPending ? "Registrando…" : "Registrar app"}
        </Button>
      </div>
    </form>
  );
}
