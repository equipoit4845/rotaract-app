import { Global, Module } from '@nestjs/common';
import { ClickMailProvider } from './clickmail.provider';
import { MAIL_PROVIDER } from './mail-provider';

@Global()
@Module({
  providers: [{ provide: MAIL_PROVIDER, useClass: ClickMailProvider }],
  exports: [MAIL_PROVIDER],
})
export class MailProviderModule {}
