export interface EntityAttachmentConfig {
  maxFiles: number;
  maxSizeBytes: number;
  allowedMimes: string[];
  canDelete: (entity: { status?: string }) => boolean;
}

const COMMON_ALLOWED_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

export const ENTITY_ATTACHMENT_CONFIG: Record<string, EntityAttachmentConfig> = {
  report: {
    maxFiles: 5,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: [...COMMON_ALLOWED_MIMES],
    canDelete: (entity) => entity.status === 'DRAFT',
  },
  project: {
    maxFiles: 10,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: [...COMMON_ALLOWED_MIMES],
    canDelete: () => true,
  },
  // Fase 2
  event: {
    maxFiles: 5,
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    canDelete: (entity) => entity.status === 'DRAFT',
  },
  committee_activity: {
    maxFiles: 5,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: [...COMMON_ALLOWED_MIMES],
    canDelete: () => true,
  },
  meeting: {
    maxFiles: 10,
    maxSizeBytes: 10 * 1024 * 1024, // 10MB
    allowedMimes: [...COMMON_ALLOWED_MIMES],
    canDelete: (entity) => entity.status === 'DRAFT',
  },
  user_avatar: {
    maxFiles: 1,
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    allowedMimes: ['image/jpeg', 'image/jpg', 'image/png'],
    canDelete: () => true,
  },
};

export function getEntityConfig(entityType: string): EntityAttachmentConfig | null {
  return ENTITY_ATTACHMENT_CONFIG[entityType] ?? null;
}
