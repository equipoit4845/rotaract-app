import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable } from 'stream';
import { StorageAdapter, UploadParams } from './storage.interface';

export class FilesystemStorageAdapter implements StorageAdapter {
  private uploadDir: string;

  constructor() {
    this.uploadDir = process.env.MEETINGS_UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  }

  private async ensureUploadDir(): Promise<string> {
    await fs.mkdir(this.uploadDir, { recursive: true });
    return this.uploadDir;
  }

  async upload(params: UploadParams): Promise<void> {
    const { key, body } = params;
    const fullPath = path.join(this.uploadDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, body);
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, key);
    try {
      await fs.unlink(fullPath);
    } catch {
      // Idempotent: ignore if file doesn't exist
    }
  }

  async getStream(key: string): Promise<Readable> {
    const fullPath = path.join(this.uploadDir, key);
    try {
      await fs.access(fullPath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      throw new Error(`Archivo no encontrado en almacenamiento: ${message}`);
    }
    const { createReadStream } = await import('fs');
    return createReadStream(fullPath);
  }
}
