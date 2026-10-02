export interface BulkRowError {
  row: number;
  data: Record<string, unknown>;
  message: string;
  field?: string;
}

export interface BulkImportResult {
  total: number;
  created: number;
  failed: number;
  mode: 'partial' | 'strict';
  createdIds?: string[];
  errors: BulkRowError[];
  reportCsv?: string;
}
