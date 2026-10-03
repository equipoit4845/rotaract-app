import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CartaPoderController } from './carta-poder.controller';
import { CartaPoderService } from './carta-poder.service';

@Module({
  imports: [AuditModule],
  controllers: [CartaPoderController],
  providers: [CartaPoderService],
  exports: [CartaPoderService],
})
export class CartaPoderModule {}
