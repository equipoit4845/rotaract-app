'use client';

import type { BulkImportResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type BulkImportReportProps = {
  result: BulkImportResult;
  onDownloadReport?: () => void;
  onClose?: () => void;
};

export function BulkImportReport({
  result,
  onDownloadReport,
  onClose,
}: BulkImportReportProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="font-medium">
          Creados: <span className="text-green-600">{result.created}</span>
        </span>
        <span className="font-medium">
          Con errores: <span className="text-destructive">{result.failed}</span>
        </span>
      </div>

      {result.errors.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Errores por fila</h4>
          <div className="max-h-48 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Fila</TableHead>
                  <TableHead>Mensaje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{e.row}</TableCell>
                    <TableCell className="text-sm text-destructive">
                      {e.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {result.reportCsv && onDownloadReport && (
            <Button variant="outline" size="sm" onClick={onDownloadReport}>
              Descargar reporte CSV
            </Button>
          )}
        </div>
      )}

      {onClose && (
        <div className="flex justify-end">
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      )}
    </div>
  );
}
