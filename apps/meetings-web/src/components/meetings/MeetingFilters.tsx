'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MEETING_STATUS_LABELS } from '@/lib/meeting-constants';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useEffect, useState } from 'react';

export type MeetingFiltersState = {
  status?: string;
  search?: string;
};

type MeetingFiltersProps = {
  filters: MeetingFiltersState;
  onFiltersChange: (filters: MeetingFiltersState) => void;
  className?: string;
};

export function MeetingFilters({ filters, onFiltersChange, className }: MeetingFiltersProps) {
  const [search, setSearch] = useState(filters.search ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    onFiltersChange({ ...filters, search: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function handleStatusChange(value: string) {
    onFiltersChange({ ...filters, status: value === '__all__' ? undefined : value });
  }

  function handleClear() {
    setSearch('');
    onFiltersChange({});
  }

  const hasFilters = !!filters.status || !!filters.search;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por título..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select
          value={filters.status ?? '__all__'}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los estados</SelectItem>
            {Object.entries(MEETING_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            Limpiar
          </Button>
        )}
      </div>
    </div>
  );
}
