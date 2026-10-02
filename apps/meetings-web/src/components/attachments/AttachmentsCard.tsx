'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { downloadAttachment } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Attachment = { id: string; fileName: string; sizeBytes?: number };

export interface AttachmentsCardProps {
  title?: string;
  fetchKey?: string;
  list: () => Promise<Attachment[]>;
  upload: (file: File) => Promise<unknown>;
  deleteAttachment: (attachmentId: string) => Promise<unknown>;
  maxFiles: number;
  maxSizeBytes?: number;
  accept?: string;
  disabled?: boolean;
  onChanged?: () => void;
}

export function AttachmentsCard({
  title = 'Adjuntos',
  fetchKey,
  list,
  upload,
  deleteAttachment,
  maxFiles,
  maxSizeBytes,
  accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',
  disabled = false,
  onChanged,
}: AttachmentsCardProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    list().then(setAttachments);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey ?? '']);

  function validateFile(file: File): string | null {
    if (maxSizeBytes && file.size > maxSizeBytes) {
      const mb = Math.round(maxSizeBytes / 1024 / 1024);
      return `El archivo supera el límite de ${mb} MB`;
    }
    return null;
  }

  const handleDownload = async (attachmentId: string) => {
    const blob = await downloadAttachment(attachmentId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachments.find((x) => x.id === attachmentId)?.fileName ?? 'download';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm('¿Eliminar adjunto?')) return;
    setLoading(true);
    setError('');
    try {
      await deleteAttachment(attachmentId);
      load();
      onChanged?.();
      toast.success('Archivo eliminado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const validationErr = validateFile(file);
    if (validationErr) {
      setError(validationErr);
      toast.error(validationErr);
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      await upload(file);
      load();
      onChanged?.();
      toast.success('Archivo subido');
      e.target.value = '';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al subir';
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const uploadDisabled = disabled || uploading || attachments.length >= maxFiles;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={accept}
            onChange={handleFileChange}
            disabled={uploadDisabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadDisabled}
          >
            {uploading ? 'Subiendo...' : 'Agregar archivo'}
            {attachments.length >= maxFiles && ` (máx. ${maxFiles})`}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin adjuntos</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(a.id)}
                  className="text-primary hover:underline truncate"
                >
                  {a.fileName}
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(a.id)}
                  disabled={loading}
                >
                  Eliminar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
