"use client";

import type { JsonSchemaNode } from "@/lib/api";
import {
  Alert,
  Button,
  Checkbox,
  FormField,
  Input,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";
import { useId, useMemo, useState, type FormEvent } from "react";

import {
  childPath,
  compact,
  fieldLabel,
  inputType,
  missingRequired,
  schemaType,
  withDefaults,
  type ConfigValue,
  type FieldErrors,
} from "../utils/schema-form";

/**
 * The configuration form of a module, generated from its
 * `configurationSchema` (JSON Schema): texts, numbers, yes/no, lists of
 * options and nested groups, with the schema's `title` as label and
 * `description` as hint. The Kernel validates on save; its Spanish errors
 * come back per field (`fieldErrors`) and are shown under each one.
 */
export function ModuleConfigurationForm({
  schema,
  initialValue,
  fieldErrors = {},
  generalError,
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: {
  schema: JsonSchemaNode | null | undefined;
  initialValue?: unknown;
  fieldErrors?: FieldErrors;
  generalError?: { title: string; description?: string } | null;
  submitLabel: string;
  isPending: boolean;
  onSubmit: (value: ConfigValue) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState<ConfigValue>(() =>
    withDefaults(schema, initialValue),
  );
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  const errors = { ...fieldErrors, ...localErrors };
  const hasFields = Object.keys(schema?.properties ?? {}).length > 0;
  // Errors on fields the form doesn't render (e.g. the root) are shown on top.
  const known = useMemo(() => collectPaths(schema), [schema]);
  const orphan = Object.entries(fieldErrors)
    .filter(([path]) => !known.has(path))
    .map(([, message]) => message);

  function submit(event: FormEvent) {
    event.preventDefault();
    const missing = missingRequired(schema, value);
    setLocalErrors(missing);
    if (Object.keys(missing).length) return;
    onSubmit(compact(schema, value));
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {hasFields ? (
        <ObjectFields
          schema={schema ?? {}}
          value={value}
          path=""
          errors={errors}
          onChange={(next) => {
            setValue(next);
            setLocalErrors({});
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Este módulo no necesita configuración.
        </p>
      )}

      {orphan.length ? (
        <Alert tone="danger" title={orphan.join(" ")} />
      ) : generalError ? (
        <Alert
          tone="danger"
          title={generalError.title}
          description={generalError.description}
        />
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function collectPaths(
  schema: JsonSchemaNode | null | undefined,
  parent = "",
  out = new Set<string>(),
): Set<string> {
  for (const [key, child] of Object.entries(schema?.properties ?? {})) {
    const path = childPath(parent, key);
    out.add(path);
    if (schemaType(child) === "object") collectPaths(child, path, out);
  }
  return out;
}

function ObjectFields({
  schema,
  value,
  path,
  errors,
  onChange,
}: {
  schema: JsonSchemaNode;
  value: ConfigValue;
  path: string;
  errors: FieldErrors;
  onChange: (value: ConfigValue) => void;
}) {
  const required = new Set(schema.required ?? []);
  return (
    <div className="flex flex-col gap-4">
      {Object.entries(schema.properties ?? {}).map(([key, child]) => (
        <Field
          key={key}
          name={key}
          schema={child}
          path={childPath(path, key)}
          required={required.has(key)}
          value={value[key]}
          errors={errors}
          onChange={(next) => onChange({ ...value, [key]: next })}
        />
      ))}
    </div>
  );
}

function Field({
  name,
  schema,
  path,
  required,
  value,
  errors,
  onChange,
}: {
  name: string;
  schema: JsonSchemaNode;
  path: string;
  required: boolean;
  value: unknown;
  errors: FieldErrors;
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const label = fieldLabel(name, schema);
  const error = errors[path];
  const type = schemaType(schema);

  if (type === "object") {
    return (
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">{label}</legend>
        {schema.description ? (
          <p className="mb-3 text-xs text-muted-foreground">
            {schema.description}
          </p>
        ) : null}
        <ObjectFields
          schema={schema}
          value={
            value && typeof value === "object" && !Array.isArray(value)
              ? (value as ConfigValue)
              : {}
          }
          path={path}
          errors={errors}
          onChange={onChange}
        />
        {error ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </fieldset>
    );
  }

  if (type === "boolean") {
    return (
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          <Switch
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
            aria-describedby={schema.description ? `${id}-hint` : undefined}
          />
        </div>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : schema.description ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {schema.description}
          </p>
        ) : null}
      </div>
    );
  }

  if (type === "array" && schema.items?.enum) {
    const selected = new Set(Array.isArray(value) ? value : []);
    return (
      <FormField
        label={label}
        required={required}
        hint={schema.description}
        error={error}
      >
        <div className="flex flex-col gap-2">
          {schema.items.enum.map((option) => {
            const optionId = `${id}-${String(option)}`;
            return (
              <label
                key={String(option)}
                htmlFor={optionId}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  id={optionId}
                  checked={selected.has(option)}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked) next.add(option);
                    else next.delete(option);
                    onChange(
                      schema.items!.enum!.filter((item) => next.has(item)),
                    );
                  }}
                />
                {String(option)}
              </label>
            );
          })}
        </div>
      </FormField>
    );
  }

  if (type === "array") {
    // Lists of texts or numbers: one per line.
    const numeric = ["number", "integer"].includes(schemaType(schema.items));
    return (
      <FormField
        label={label}
        required={required}
        htmlFor={id}
        hint={schema.description ?? "Uno por línea."}
        error={error}
      >
        <Textarea
          id={id}
          value={Array.isArray(value) ? value.join("\n") : ""}
          onChange={(event) => {
            const lines = event.target.value
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean);
            onChange(numeric ? lines.map(Number) : lines);
          }}
          aria-invalid={Boolean(error)}
        />
      </FormField>
    );
  }

  if (schema.enum) {
    return (
      <FormField
        label={label}
        required={required}
        htmlFor={id}
        hint={schema.description}
        error={error}
      >
        <Select
          id={id}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(event) => {
            const raw = event.target.value;
            const option = schema.enum!.find((item) => String(item) === raw);
            onChange(raw === "" ? undefined : option);
          }}
          aria-invalid={Boolean(error)}
        >
          {required && value !== undefined ? null : (
            <option value="">Elegí una opción…</option>
          )}
          {schema.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </Select>
      </FormField>
    );
  }

  if (type === "number" || type === "integer") {
    return (
      <FormField
        label={label}
        required={required}
        htmlFor={id}
        hint={schema.description}
        error={error}
      >
        <Input
          id={id}
          type="number"
          inputMode={type === "integer" ? "numeric" : "decimal"}
          step={type === "integer" ? 1 : "any"}
          min={schema.minimum}
          max={schema.maximum}
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? undefined
                : Number(event.target.value),
            )
          }
          aria-invalid={Boolean(error)}
          className="max-w-40"
        />
      </FormField>
    );
  }

  const long = (schema.maxLength ?? 0) > 160;
  return (
    <FormField
      label={label}
      required={required}
      htmlFor={id}
      hint={schema.description}
      error={error}
    >
      {long ? (
        <Textarea
          id={id}
          maxLength={schema.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
        />
      ) : (
        <Input
          id={id}
          type={inputType(schema)}
          maxLength={schema.maxLength}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
        />
      )}
    </FormField>
  );
}
