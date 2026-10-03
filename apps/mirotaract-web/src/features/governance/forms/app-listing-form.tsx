"use client";

import type { AppAudience, AppCatalogItem } from "@/lib/api";
import { usePositionDefinitions, useUpdateAppListing } from "@/lib/api";
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  Input,
  Textarea,
} from "@/components/ui";
import { useState, type FormEvent } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

import { AppIcon, KNOWN_ICON_NAMES } from "../components/app-icon";
import { AUDIENCE_OPTIONS } from "../utils/governance-labels";

type Errors = Partial<
  Record<"displayName" | "icon" | "launchUrl" | "audiences" | "order", string>
>;

const LUCIDE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Name, description, icon, link, audience and order of an app in the panel. */
export function AppListingForm({
  item,
  publish = false,
  onDone,
}: {
  item: AppCatalogItem;
  /** Also publish it when saving. */
  publish?: boolean;
  onDone: () => void;
}) {
  const update = useUpdateAppListing();
  const positions = usePositionDefinitions();
  const listing = item.listing;
  const [displayName, setDisplayName] = useState(listing.displayName);
  const [description, setDescription] = useState(
    listing.shortDescription ?? "",
  );
  const [icon, setIcon] = useState(listing.icon ?? "");
  const [launchUrl, setLaunchUrl] = useState(listing.launchUrl ?? "");
  const [audiences, setAudiences] = useState<Set<AppAudience>>(
    () => new Set(listing.audiences),
  );
  const [positionCodes, setPositionCodes] = useState<Set<string>>(
    () => new Set(listing.positionCodes),
  );
  const [order, setOrder] = useState(String(listing.displayOrder));
  const [errors, setErrors] = useState<Errors>({});

  function toggle<T>(set: Set<T>, value: T, on: boolean): Set<T> {
    const next = new Set(set);
    if (on) next.add(value);
    else next.delete(value);
    return next;
  }

  function validate(): Errors {
    const next: Errors = {};
    const name = displayName.trim();
    if (name.length < 2 || name.length > 60)
      next.displayName = "El nombre tiene que tener entre 2 y 60 caracteres.";
    const iconValue = icon.trim();
    if (iconValue && !LUCIDE.test(iconValue) && !/^https:\/\//.test(iconValue))
      next.icon =
        "Usá un nombre de ícono (por ejemplo calendar-days) o una dirección https de una imagen.";
    if (!/^https:\/\//.test(launchUrl.trim()))
      next.launchUrl = "El enlace tiene que empezar con https://";
    if (audiences.has("POSITIONS") && positionCodes.size === 0)
      next.audiences = "Elegí al menos un cargo.";
    if ((publish || item.listing.published) && audiences.size === 0)
      next.audiences = "Elegí al menos a quién mostrarle la app.";
    const orderNumber = Number(order);
    if (!Number.isInteger(orderNumber) || orderNumber < 0 || orderNumber > 1000)
      next.order = "Un número entre 0 y 1000.";
    return next;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;
    update.mutate(
      {
        appId: item.appId,
        payload: {
          displayName: displayName.trim(),
          shortDescription: description.trim() || null,
          icon: icon.trim() || null,
          launchUrl: launchUrl.trim(),
          audiences: [...audiences],
          positionCodes: audiences.has("POSITIONS") ? [...positionCodes] : [],
          displayOrder: Number(order),
          ...(publish ? { published: true } : {}),
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        label="Nombre que ven los socios"
        htmlFor={`name-${item.appId}`}
        error={errors.displayName}
      >
        <Input
          id={`name-${item.appId}`}
          value={displayName}
          maxLength={60}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </FormField>
      <FormField
        label="Descripción corta"
        htmlFor={`description-${item.appId}`}
        hint="Hasta 160 caracteres."
      >
        <Textarea
          id={`description-${item.appId}`}
          value={description}
          maxLength={160}
          onChange={(event) => setDescription(event.target.value)}
        />
      </FormField>
      <FormField
        label="Ícono"
        htmlFor={`icon-${item.appId}`}
        error={errors.icon}
        hint={`Un nombre de ícono (${KNOWN_ICON_NAMES.slice(0, 6).join(", ")}...) o la dirección https de una imagen.`}
      >
        <div className="flex items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <AppIcon icon={icon.trim() || null} className="size-5" />
          </span>
          <Input
            id={`icon-${item.appId}`}
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
          />
        </div>
      </FormField>
      <FormField
        label="Enlace para abrir la app"
        htmlFor={`url-${item.appId}`}
        error={errors.launchUrl}
      >
        <Input
          id={`url-${item.appId}`}
          type="url"
          value={launchUrl}
          onChange={(event) => setLaunchUrl(event.target.value)}
        />
      </FormField>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">¿Quién la ve?</legend>
        {AUDIENCE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-2 text-sm"
            htmlFor={`aud-${item.appId}-${option.value}`}
          >
            <Checkbox
              id={`aud-${item.appId}-${option.value}`}
              checked={audiences.has(option.value)}
              onCheckedChange={(value) =>
                setAudiences((current) =>
                  toggle(current, option.value, value === true),
                )
              }
            />
            {option.label}
          </label>
        ))}
        {audiences.has("POSITIONS") ? (
          <div className="ml-6 grid gap-1.5">
            {(positions.data ?? []).map((position) => (
              <label
                key={position.id}
                className="flex items-center gap-2 text-sm"
                htmlFor={`pos-${item.appId}-${position.code}`}
              >
                <Checkbox
                  id={`pos-${item.appId}-${position.code}`}
                  checked={positionCodes.has(position.code)}
                  onCheckedChange={(value) =>
                    setPositionCodes((current) =>
                      toggle(current, position.code, value === true),
                    )
                  }
                />
                {position.name}
              </label>
            ))}
          </div>
        ) : null}
        {errors.audiences ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.audiences}
          </p>
        ) : null}
      </fieldset>
      <FormField
        label="Orden"
        htmlFor={`order-${item.appId}`}
        error={errors.order}
        hint="Las apps con número más bajo aparecen primero."
      >
        <Input
          id={`order-${item.appId}`}
          type="number"
          min={0}
          max={1000}
          value={order}
          onChange={(event) => setOrder(event.target.value)}
          className="max-w-32"
        />
      </FormField>
      {update.isError ? (
        <Alert tone="danger" {...describeKernelError(update.error)} />
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={update.isPending}>
          {publish ? "Guardar y mostrar" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
