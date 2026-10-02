import { Readable } from 'stream';

export interface UploadParams {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageAdapter {
  upload(params: UploadParams): Promise<void>;
  delete(key: string): Promise<void>;
  getStream(key: string): Promise<Readable>;
  getPublicUrl?(key: string): string | null;
}
