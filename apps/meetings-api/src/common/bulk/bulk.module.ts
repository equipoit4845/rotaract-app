import { Global, Module } from '@nestjs/common';
import { CsvParserService } from './csv-parser.service';

@Global()
@Module({
  providers: [CsvParserService],
  exports: [CsvParserService],
})
export class BulkModule {}
