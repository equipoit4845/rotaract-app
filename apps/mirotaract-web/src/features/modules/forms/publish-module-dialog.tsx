"use client";

import type { DeveloperApp, ModuleDefinition } from "@/lib/api";
import {
  KernelApiError,
  useRegisterModule,
  useUpdateModuleManifest,
} from "@/lib/api";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { useState, type ChangeEvent } from "react";

import { describeKernelError } from "@/features/shell/kernel-error-message";

/**
 * Publishing a module = sending its manifest (mirotaract.module.json).
 * New: pick the app that owns it. Existing: a new version of the same id.
 * The Kernel validates everything and answers with Spanish errors per
 * field, listed here as-is.
 */
export function PublishModuleDialog({
  open,
  onOpenChange,
  apps,
  module,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Apps of the district that can own a new module. */
  apps: DeveloperApp[];
  /** Set to publish a new version of this module. */
  module?: ModuleDefinition;
}) {
  const register = useRegisterModule();
  const update = useUpdateModuleManifest();
  const mutation = module ? update : register;
  const activeApps = apps.filter((app) => app.status === "ACTIVE");
  const [appId, setAppId] = useState("");
  const [text, setText] = useState(() =>
    module ? JSON.stringify(module.manifest, null, 2) : "",
  );
  const [parseError, setParseError] = useState<string | null>(null);

  function close(next: boolean) {
    if (!next) {
      register.reset();
      update.reset();
      setParseError(null);
    }
    onOpenChange(next);
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setText(await file.text());
  }

  function submit() {
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(text);
    } catch {
      setParseError(
        "El texto no es un JSON válido. Copiá el contenido completo de mirotaract.module.json.",
      );
      return;
    }
    setParseError(null);
    const onSuccess = () => close(false);
    if (module) update.mutate({ moduleId: module.id, manifest }, { onSuccess });
    else register.mutate({ appId, manifest } as never, { onSuccess });
  }

  const error = mutation.error;
  const fieldErrors = error instanceof KernelApiError ? error.fieldErrors : [];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {module ? `Publicar versión de ${module.name}` : "Publicar módulo"}
          </DialogTitle>
          <DialogDescription>
            {module
              ? `Pegá el manifiesto nuevo (versión ${module.version} o posterior). Los permisos que ya no estén se quitan también de los cargos.`
              : "Pegá o subí el manifiesto del módulo (mirotaract.module.json). Sus permisos quedan disponibles para asignar a los cargos."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {module ? null : (
            <FormField
              label="App dueña del módulo"
              htmlFor="module-app"
              required
              hint="La app registrada en Apps que usa el comité para este módulo."
            >
              <Select
                id="module-app"
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
              >
                <option value="">Elegí una app…</option>
                {activeApps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Archivo" htmlFor="module-file">
            <Input
              id="module-file"
              type="file"
              accept="application/json,.json"
              onChange={loadFile}
            />
          </FormField>
          <FormField
            label="Manifiesto"
            htmlFor="module-manifest"
            required
            error={parseError ?? undefined}
          >
            <Textarea
              id="module-manifest"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-64 font-mono text-xs"
              spellCheck={false}
              placeholder='{ "id": "reuniones", "name": "Reuniones distritales", ... }'
            />
          </FormField>

          {error ? (
            fieldErrors.length ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="font-medium">El manifiesto tiene problemas:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {fieldErrors.map((item) => (
                    <li key={`${item.path}-${item.message}`}>
                      {item.path ? (
                        <code className="mr-1 text-xs">{item.path}</code>
                      ) : null}
                      {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <Alert tone="danger" {...describeKernelError(error)} />
            )
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending || !text.trim() || (!module && !appId)}
            onClick={submit}
          >
            {mutation.isPending ? "Publicando…" : "Publicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
