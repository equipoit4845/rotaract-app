'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

type BulkImportDropzoneProps = {
  onFileSelect: (file: File) => void;
  accept?: string;
  disabled?: boolean;
};

export function BulkImportDropzone({
  onFileSelect,
  accept = '.csv',
  disabled,
}: BulkImportDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file?.name.endsWith('.csv')) {
        onFileSelect(file);
      }
    },
    [onFileSelect, disabled],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
      e.target.value = '';
    },
    [onFileSelect],
  );

  return (
    <label
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer',
        isDragging && !disabled
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50',
        disabled && 'pointer-events-none opacity-60',
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
      <span className="text-sm text-muted-foreground">
        Arrastrá un archivo CSV o hacé clic para seleccionar
      </span>
    </label>
  );
}
