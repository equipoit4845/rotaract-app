import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '../prisma/client';
import { AttachmentsService } from './attachments.service';

@Controller('attachments')
@UseGuards(AuthGuard('jwt'))
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Req() req: { user: { id: string; role?: string } },
    @Res() res: Response,
  ) {
    const { buffer, attachment } = await this.attachmentsService.getForDownload(
      id,
      req.user.id,
      (req.user.role as Role) ?? undefined,
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
    );
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    res.send(buffer);
  }
}
