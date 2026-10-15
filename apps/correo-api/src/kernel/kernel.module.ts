import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { KERNEL_DIRECTORY, KernelService } from './kernel.service';

@Global()
@Module({
  providers: [KernelService, AccessService, { provide: KERNEL_DIRECTORY, useExisting: KernelService }],
  exports: [KernelService, AccessService, KERNEL_DIRECTORY],
})
export class KernelModule {}
