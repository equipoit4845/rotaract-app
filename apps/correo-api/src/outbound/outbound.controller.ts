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
import { FileFieldsInterceptor } from '@nestjs/platform-express';
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

/** `attachments`: files; `inline`: images pasted into the text, matched to `payload.inlineIds`. */
const uploads = FileFieldsInterceptor(
  [
    { name: 'attachments', maxCount: MAX_ATTACHMENTS },
    { name: 'inline', maxCount: MAX_ATTACHMENTS },
  ],
  {
    storage: memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS * 2, fields: 5, fieldSize: 2 * 1024 * 1024 },
  },
);

type Uploads = { attachments?: UploadedFile[]; inline?: UploadedFile[] };
const CID = /^[A-Za-z0-9._@-]{1,100}$/;

/** Attachments plus the inline images, each with its Content-ID (all count to the 10-file limit). */
function filesOf(uploads: Uploads | undefined, inlineIds: unknown): UploadedFile[] {
  const inline = uploads?.inline ?? [];
  const ids = Array.isArray(inlineIds) ? inlineIds : [];
  if (ids.length !== inline.length || ids.some((id) => typeof id !== 'string' || !CID.test(id))) {
    throw new BadRequestException('Las imágenes del texto no se pudieron adjuntar.');
  }
  return [...(uploads?.attachments ?? []), ...inline.map((f, i) => ({ ...f, contentId: ids[i] as string }))];
}

function html(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  if (v.length > 500_000) throw new BadRequestException('El mensaje es demasiado largo.');
  return v;
}

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

  /** `POST /mailboxes/:id/messages` (multipart): `{ to, cc, bcc, subject, text, html?, inlineIds?, idempotencyKey }`. */
  @Post('mailboxes/:id/messages')
  @UseInterceptors(uploads)
  compose(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') mailboxId: string,
    @Body('payload') raw: unknown,
    @UploadedFiles() uploads: Uploads = {},
  ) {
    const p = payloadOf<Record<string, unknown>>(raw);
    const files = filesOf(uploads, p.inlineIds);
    const input: ComposeInput = {
      to: strings(p.to),
      cc: strings(p.cc),
      bcc: strings(p.bcc),
      subject: typeof p.subject === 'string' ? p.subject.slice(0, 500) : '',
      text: text(p.text),
      html: html(p.html),
      idempotencyKey: idempotencyKey(p.idempotencyKey),
    };
    return this.outbound.compose(user.personId, mailboxId, input, files);
  }

  /** `POST /threads/:id/reply` (multipart): `{ replyAll, cc, bcc, text, messageId?, idempotencyKey }`. */
  @Post('threads/:id/reply')
  @UseInterceptors(uploads)
  reply(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') threadId: string,
    @Body('payload') raw: unknown,
    @UploadedFiles() uploads: Uploads = {},
  ) {
    const p = payloadOf<Record<string, unknown>>(raw);
    const files = filesOf(uploads, p.inlineIds);
    const input: ReplyInput = {
      replyAll: p.replyAll === true,
      cc: strings(p.cc),
      bcc: strings(p.bcc),
      text: text(p.text),
      html: html(p.html),
      messageId: typeof p.messageId === 'string' ? p.messageId : undefined,
      idempotencyKey: idempotencyKey(p.idempotencyKey),
    };
    return this.outbound.reply(user.personId, threadId, input, files);
  }
}
