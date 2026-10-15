import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  OutboundService,
  type ComposeInput,
  type ReplyInput,
  type UploadedFile,
} from './outbound.service';

const uploads = FilesInterceptor('attachments', MAX_ATTACHMENTS, {
  storage: memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS, fields: 5, fieldSize: 2 * 1024 * 1024 },
});

/** The multipart field `payload` carries the JSON; `attachments` the files. */
function payloadOf<T>(raw: unknown): T {
  if (typeof raw !== 'string') throw new BadRequestException('Falta el contenido del mail.');
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new BadRequestException('El contenido del mail no se pudo leer.');
  }
}

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function idempotencyKey(v: unknown): string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(v)) {
    throw new BadRequestException('Falta la clave del envío (idempotencyKey).');
  }
  return v;
}

function text(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new BadRequestException('El mail está vacío.');
  if (v.length > 200_000) throw new BadRequestException('El texto es demasiado largo.');
  return v;
}

/** Writing: a new email from a mailbox, a reply in a conversation. */
@Controller()
@UseGuards(AuthGuard('jwt'))
export class OutboundController {
  constructor(private readonly outbound: OutboundService) {}

  /** `POST /mailboxes/:id/messages` (multipart): `{ to, cc, bcc, subject, text, idempotencyKey }`. */
  @Post('mailboxes/:id/messages')
  @UseInterceptors(uploads)
  compose(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') mailboxId: string,
    @Body('payload') raw: unknown,
    @UploadedFiles() files: UploadedFile[] = [],
  ) {
    const p = payloadOf<Record<string, unknown>>(raw);
    const input: ComposeInput = {
      to: strings(p.to),
      cc: strings(p.cc),
      bcc: strings(p.bcc),
      subject: typeof p.subject === 'string' ? p.subject.slice(0, 500) : '',
      text: text(p.text),
      idempotencyKey: idempotencyKey(p.idempotencyKey),
    };
    return this.outbound.compose(user.personId, mailboxId, input, files ?? []);
  }

  /** `POST /threads/:id/reply` (multipart): `{ replyAll, cc, bcc, text, messageId?, idempotencyKey }`. */
  @Post('threads/:id/reply')
  @UseInterceptors(uploads)
  reply(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') threadId: string,
    @Body('payload') raw: unknown,
    @UploadedFiles() files: UploadedFile[] = [],
  ) {
    const p = payloadOf<Record<string, unknown>>(raw);
    const input: ReplyInput = {
      replyAll: p.replyAll === true,
      cc: strings(p.cc),
      bcc: strings(p.bcc),
      text: text(p.text),
      messageId: typeof p.messageId === 'string' ? p.messageId : undefined,
      idempotencyKey: idempotencyKey(p.idempotencyKey),
    };
    return this.outbound.reply(user.personId, threadId, input, files ?? []);
  }
}
