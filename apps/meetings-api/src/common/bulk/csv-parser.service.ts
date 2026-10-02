import { Injectable, BadRequestException } from '@nestjs/common';
import { neutralizeCsvFormula } from './csv-safe';

const UTF8_BOM = '\uFEFF';
const MAX_ROWS = 500;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ParsedCsvRow {
  [key: string]: string;
}

@Injectable()
export class CsvParserService {
  /**
   * Parsea un buffer CSV con encoding UTF-8.
   * Detecta y elimina BOM si está presente.
   * Retorna array de objetos con keys del header.
   */
  parse(buffer: Buffer): ParsedCsvRow[] {
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo de ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB`,
      );
    }

    let content = buffer.toString('utf8');
    if (content.startsWith(UTF8_BOM)) {
      content = content.slice(UTF8_BOM.length);
    }

    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      throw new BadRequestException('El archivo CSV está vacío');
    }
    if (lines.length > MAX_ROWS + 1) {
      throw new BadRequestException(
        `El archivo excede el máximo de ${MAX_ROWS} filas de datos`,
      );
    }

    const headers = this.parseRow(lines[0]);
    if (headers.length === 0 || headers.every((h) => !h)) {
      throw new BadRequestException('El archivo no tiene encabezados válidos');
    }

    const rows: ParsedCsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseRow(lines[i]);
      const row: ParsedCsvRow = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      rows.push(row);
    }

    return rows;
  }

  /**
   * Parsea una fila CSV respetando comillas dobles.
   */
  private parseRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((char === ',' && !inQuotes) || char === '\n' || char === '\r') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Genera CSV con BOM UTF-8 para descarga (plantillas).
   */
  generateTemplateCsv(header: string[], exampleRow: string[]): Buffer {
    const rows = [header.join(','), exampleRow.map((v) => this.escapeCsvValue(v)).join(',')];
    const content = UTF8_BOM + rows.join('\n') + '\n';
    return Buffer.from(content, 'utf8');
  }

  private escapeCsvValue(val: string): string {
    const safe = String(neutralizeCsvFormula(val) ?? '');
    if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
      return '"' + safe.replace(/"/g, '""') + '"';
    }
    return safe;
  }

  /**
   * Genera reporte CSV con filas creadas y errores.
   */
  generateReportCsv(
    headers: string[],
    errors: { row: number; data: Record<string, unknown>; message: string }[],
  ): string {
    const reportHeaders = ['fila', 'mensaje', ...headers];
    const rows = errors.map((e) => {
      const dataValues = headers.map((h) => String(e.data[h] ?? '').replace(/,/g, ';'));
      return [e.row, e.message, ...dataValues].map((v) => this.escapeCsvValue(String(v))).join(',');
    });
    return UTF8_BOM + [reportHeaders.join(','), ...rows].join('\n') + '\n';
  }
}
