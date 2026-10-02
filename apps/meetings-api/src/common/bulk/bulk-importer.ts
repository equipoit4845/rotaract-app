import { Logger } from '@nestjs/common';
import { CsvParserService, ParsedCsvRow } from './csv-parser.service';
import { BulkImportResult } from './bulk-result.types';

export abstract class BulkImporter<TDto> {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly csv: CsvParserService) {}

  protected abstract csvHeaders(): string[];
  protected abstract parseRow(row: ParsedCsvRow, rowNumber: number): Promise<TDto> | TDto;
  protected abstract persist(rows: TDto[]): Promise<{ createdIds: string[] }>;

  async import(buffer: Buffer, mode: 'partial' | 'strict'): Promise<BulkImportResult> {
    const rows = this.csv.parse(buffer);
    const errors: { row: number; data: Record<string, unknown>; message: string }[] = [];
    const valid: TDto[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2;
      try {
        const dto = await this.parseRow(rows[i], rowNumber);
        valid.push(dto);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ row: rowNumber, data: rows[i], message });
        if (mode === 'strict') {
          return this.buildResult(rows.length, [], errors, mode);
        }
      }
    }

    let createdIds: string[] = [];
    if (valid.length > 0) {
      try {
        const result = await this.persist(valid);
        createdIds = result.createdIds;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`persist() failed: ${message}`);
        if (mode === 'strict') {
          return this.buildResult(rows.length, [], [...errors, { row: 0, data: {}, message: `Persist error: ${message}` }], mode);
        }
      }
    }

    return this.buildResult(rows.length, createdIds, errors, mode);
  }

  private buildResult(
    total: number,
    createdIds: string[],
    errors: { row: number; data: Record<string, unknown>; message: string }[],
    mode: 'partial' | 'strict',
  ): BulkImportResult {
    return {
      total,
      created: createdIds.length,
      failed: errors.length,
      mode,
      createdIds,
      errors,
      reportCsv: errors.length ? this.csv.generateReportCsv(this.csvHeaders(), errors) : undefined,
    };
  }
}
