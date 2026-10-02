'use client';

import { useCallback, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BulkImportDropzone } from './BulkImportDropzone';
import { BulkImportReport } from './BulkImportReport';
import type { BulkImportResult } from '@/lib/api';

type BulkImportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  onDownloadTemplate: () => Promise<void>;
  onImport: (file: File, mode: 'partial' | 'strict') => Promise<BulkImportResult>;
  onSuccess?: () => void;
};

export function BulkImportModal({
  isOpen,
  onClose,
  title,
  description,
  onDownloadTemplate,
  onImport,
  onSuccess,
}: BulkImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [error, setError] = useState('');

  const handleFileSelect = useCallback(
    async (file: File) => {
      setError('');
      setLoading(true);
      try {
        const res = await onImport(file, strictMode ? 'strict' : 'partial');
        setResult(res);
        if (res.failed === 0 && res.created > 0) {
          onSuccess?.();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al importar');
      } finally {
        setLoading(false);
      }
    },
    [onImport, strictMode, onSuccess],
  );

  const handleDownloadReport = useCallback(() => {
    if (!result?.reportCsv) return;
    const blob = new Blob([result.reportCsv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporte-importacion.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [result?.reportCsv]);

  const handleClose = useCallback(() => {
    setResult(null);
    setError('');
    onClose();
  }, [onClose]);

  const showReport = result !== null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent showCloseButton className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        {!showReport ? (
          <div className="space-y-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError('');
                onDownloadTemplate().catch((e) =>
                  setError(e instanceof Error ? e.message : 'Error al descargar'),
                );
              }}
            >
              Descargar plantilla
            </Button>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="strict"
                checked={strictMode}
                onChange={(e) => setStrictMode(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="strict" className="text-sm">
                Modo estricto: si hay un error, no se crea nada
              </label>
            </div>

            <BulkImportDropzone
              onFileSelect={handleFileSelect}
              disabled={loading}
            />

            {loading && (
              <p className="text-sm text-muted-foreground">
                Procesando archivo...
              </p>
            )}
            {error && (
              <p className="text-sm font-medium text-destructive">{error}</p>
            )}
          </div>
        ) : (
          <BulkImportReport
            result={result}
            onDownloadReport={
              result.reportCsv ? handleDownloadReport : undefined
            }
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
