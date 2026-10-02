export const MEETING_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SCHEDULED: 'Programada',
  LIVE: 'En vivo',
  PAUSED: 'Pausada',
  FINISHED: 'Finalizada',
  ARCHIVED: 'Archivada',
};

export const TOPIC_TYPE_LABELS: Record<string, string> = {
  DISCUSSION: 'Discusión',
  VOTING: 'Votación',
  INFORMATIVE: 'Informativo',
};

export const TOPIC_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completado',
};

export const SPEAKING_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptado',
};

export const MEETING_STATUS_ORDER = [
  'DRAFT',
  'SCHEDULED',
  'LIVE',
  'FINISHED',
] as const;

export const MEETING_TYPE_LABELS: Record<string, string> = {
  ORDINARY: 'Ordinaria',
  EXTRAORDINARY: 'Extraordinaria',
};

export const VOTING_METHOD_LABELS: Record<string, string> = {
  PUBLIC: 'Pública',
  SECRET: 'Secreta',
};

export const MAJORITY_TYPE_LABELS: Record<string, string> = {
  SIMPLE: 'Mayoría Simple',
  ABSOLUTE: 'Mayoría Absoluta',
  TWO_THIRDS: 'Dos Tercios',
  THREE_QUARTERS: 'Tres Cuartos',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  CONFERENCIA: 'Conferencia Distrital',
  ERIPA: 'ERIPA',
  ASAMBLEA: 'Asamblea Distrital',
  FORO_ZONAL: 'Foro Zonal',
  SEMINARIO_INSTRUCTORES: 'Seminario de Instructores',
  DISTRITAL: 'Distrital',
  CLUB: 'Club',
  CAPACITACION: 'Capacitación',
  REUNION: 'Reunión',
  PROYECTO_SERVICIO: 'Proyecto de Servicio',
  NETWORKING: 'Networking',
  PROFESIONAL: 'Profesional',
};
