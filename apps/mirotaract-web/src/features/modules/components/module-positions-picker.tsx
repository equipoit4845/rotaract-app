"use client";

import type {
  ModulePositionSelection,
  ModulePositionsOverview,
} from "@/lib/api";
import { Badge, Checkbox } from "@/components/ui";

/** Default selection: every template (they are suggested for a reason), no grant. */
export function defaultPositionSelection(
  overview: ModulePositionsOverview | undefined,
): ModulePositionSelection {
  return {
    positions: (overview?.positions ?? [])
      .filter((template) => !template.position || template.position.archived)
      .map((template) => template.key),
    grants: [],
  };
}

/** Something the person can still choose (a template not created, a grant not applied). */
export function hasPendingPositions(
  overview: ModulePositionsOverview | undefined,
): boolean {
  return Boolean(
    overview?.positions.some(
      (template) => !template.position || template.position.archived,
    ) || overview?.grants.some((grant) => grant.allowed && !grant.applied),
  );
}

function toggle(list: string[], value: string, on: boolean): string[] {
  return on
    ? [...new Set([...list, value])]
    : list.filter((item) => item !== value);
}

/**
 * The positions a module creates in the organization and the permissions it
 * suggests adding to existing ones. Required positions can't be unticked;
 * grants on positions another organization manages are shown, not offered.
 */
export function ModulePositionsPicker({
  overview,
  value,
  onChange,
  idPrefix,
}: {
  overview: ModulePositionsOverview;
  value: ModulePositionSelection;
  onChange: (value: ModulePositionSelection) => void;
  idPrefix: string;
}) {
  if (!overview.positions.length && !overview.grants.length) return null;
  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      {overview.positions.length ? (
        <section className="space-y-2">
          <p className="text-sm font-medium">Cargos que crea</p>
          <p className="text-xs text-muted-foreground">
            Quedan como cargos propios de esta organización y nombrás a las
            personas desde Autoridades, como en cualquier cargo. Solo dan
            permisos de este módulo.
          </p>
          <ul className="space-y-3">
            {overview.positions.map((template) => {
              const id = `${idPrefix}-position-${template.key}`;
              const created = template.position && !template.position.archived;
              const required = template.install === "required";
              return (
                <li key={template.key} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={
                      Boolean(created) ||
                      required ||
                      value.positions.includes(template.key)
                    }
                    disabled={Boolean(created) || required}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...value,
                        positions: toggle(
                          value.positions,
                          template.key,
                          checked === true,
                        ),
                      })
                    }
                  />
                  <label htmlFor={id} className="text-sm leading-5">
                    <span className="font-medium">{template.name}</span>
                    {created ? (
                      <Badge tone="success" className="ml-2">
                        Creado
                      </Badge>
                    ) : required ? (
                      <Badge tone="info" className="ml-2">
                        Obligatorio
                      </Badge>
                    ) : null}
                    {template.description ? (
                      <span className="block text-xs text-muted-foreground">
                        {template.description}
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      Permite:{" "}
                      {template.permissions
                        .map((permission) => permission.name)
                        .join(" · ")}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {overview.grants.length ? (
        <section className="space-y-2">
          <p className="text-sm font-medium">
            Permisos para cargos que ya existen
          </p>
          <ul className="space-y-3">
            {overview.grants.map((grant) => {
              const id = `${idPrefix}-grant-${grant.positionCode}`;
              const label = grant.positionName ?? grant.positionCode;
              return (
                <li key={grant.positionCode} className="flex items-start gap-2">
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={
                      grant.applied || value.grants.includes(grant.positionCode)
                    }
                    disabled={!grant.allowed || grant.applied}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...value,
                        grants: toggle(
                          value.grants,
                          grant.positionCode,
                          checked === true,
                        ),
                      })
                    }
                  />
                  <label htmlFor={id} className="text-sm leading-5">
                    <span className="font-medium">{label}</span>
                    {grant.applied ? (
                      <Badge tone="success" className="ml-2">
                        Aplicado
                      </Badge>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      Suma:{" "}
                      {grant.permissions
                        .map((permission) => permission.name)
                        .join(" · ")}
                    </span>
                    {!grant.allowed ? (
                      <span className="block text-xs text-muted-foreground">
                        {grant.positionName
                          ? "Este cargo lo administra otra organización: solo ella puede sumarle permisos."
                          : "Este cargo no existe acá."}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
