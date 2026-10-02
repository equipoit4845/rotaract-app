"use client";

import { Select } from "@/components/ui";

import type { SuperadminViewMode } from "./superadmin-mode-context";

/** Purely presentational selector; the Shell provides the current mode. */
export function SuperadminModeSwitcher({
  mode,
  onChange,
}: {
  mode: SuperadminViewMode;
  onChange: (mode: SuperadminViewMode) => void;
}) {
  return (
    <Select
      aria-label="Modo de visualización"
      value={mode}
      onChange={(event) => onChange(event.target.value as SuperadminViewMode)}
      title="Cambia la experiencia visual; no modifica tus permisos"
    >
      <option value="ADMIN">Administración distrital</option>
      <option value="CLUB">Vista de club</option>
    </Select>
  );
}
