/**
 * Configuración de adjuntos alineada con apps/api/src/attachments/config/attachment-entity.config.ts
 */

const COMMON_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png';

export const ATTACHMENT_CONFIG = {
  report: {
    maxFiles: 5,
    maxSizeMB: 10,
    accept: COMMON_ACCEPT,
  },
  project: {
    maxFiles: 10,
    maxSizeMB: 10,
    accept: COMMON_ACCEPT,
  },
  meeting: {
    maxFiles: 10,
    maxSizeMB: 10,
    accept: COMMON_ACCEPT,
  },
  event: {
    maxFiles: 5,
    maxSizeMB: 5,
    accept: '.pdf,.jpg,.jpeg,.png',
  },
  committee_activity: {
    maxFiles: 5,
    maxSizeMB: 10,
    accept: COMMON_ACCEPT,
  },
} as const;

export type AttachmentEntityType = keyof typeof ATTACHMENT_CONFIG;
