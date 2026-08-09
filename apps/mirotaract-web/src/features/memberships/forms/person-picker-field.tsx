"use client";

import { FormField, Input, Select } from "@equipoit4845/ui";

import { personDisplayName } from "../adapters/person-display-name";
import { usePersonSearch } from "./use-person-search";

/**
 * Search-then-select, not a free-typed id and not "list every person" —
 * `usePersonSearch` is the only source of candidates, always a bounded
 * request (product spec §14/§32). Never imports from `features/persons/**`
 * — this is a local, feature-owned ViewModel built on top of the public
 * `usePersons` hook (product spec §22).
 */
export function PersonPickerField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (personId: string) => void;
  error?: string;
}) {
  const { draft, setDraft, results, isLoading } = usePersonSearch();

  return (
    <>
      <FormField label="Buscar por nombre o email" htmlFor="personSearch">
        <Input
          id="personSearch"
          type="search"
          placeholder="Nombre, apellido o email…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </FormField>
      <FormField
        label="Persona"
        htmlFor="personId"
        required
        error={error}
        hint={
          isLoading
            ? "Buscando…"
            : results.length === 0
              ? "Sin resultados. ¿No encontrás a la persona? Creála primero en Personas."
              : undefined
        }
      >
        <Select
          id="personId"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Elegí una persona</option>
          {results.map((person) => (
            <option key={person.id} value={person.id}>
              {personDisplayName(person)}
            </option>
          ))}
        </Select>
      </FormField>
    </>
  );
}
