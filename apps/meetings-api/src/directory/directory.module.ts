import { Global, Module } from '@nestjs/common';
import { ClubsController } from './clubs.controller';
import { DirectoryService } from './directory.service';
import { DirectorySyncService } from './directory-sync.service';
import { KernelClient } from './kernel-client';
import { UsersController } from './users.controller';

@Global()
@Module({
  controllers: [ClubsController, UsersController],
  providers: [KernelClient, DirectorySyncService, DirectoryService],
  exports: [KernelClient, DirectorySyncService, DirectoryService],
})
export class DirectoryModule {}
