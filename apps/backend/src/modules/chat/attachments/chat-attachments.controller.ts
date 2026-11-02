import { pipeline } from 'node:stream/promises';

import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { CsrfGuard } from '../../../common/security/csrf.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { IJwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ConversationIdParamDto } from '../dto/conversation-id-param.dto';

import { contentDispositionFor } from './attachment-filename.util';
import {
  attachmentTempStorage,
  type StoredTempFile,
} from './attachment-upload.storage-engine';
import {
  ChatAttachmentUploadInterceptor,
  getUploadPermit,
} from './chat-attachment-upload.interceptor';
import { AttachmentIdParamDto } from './chat-attachments-param.dto';
import {
  CHAT_ATTACHMENT_FIELD,
  DB_CEILINGS,
} from './chat-attachments.constants';
import { ChatAttachmentsService } from './chat-attachments.service';

type AuthenticatedRequest = Request & { user: IJwtPayload };

/**
 * Attachments of DIRECT chat conversations.
 *
 * Same security model as ChatController (see there): the class is guarded by
 * the existing JwtAuthGuard, state-changing handlers also by the existing
 * CsrfGuard, there is no new permission and no RBAC change. Access to a file
 * is decided by ChatAttachmentsService through the existing chat conversation
 * authorization - never by an id, a path or a link.
 */
@ApiTags('Chat')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatAttachmentsController {
  constructor(private readonly attachments: ChatAttachmentsService) {}

  @Get('attachments/config')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Attachment feature availability and limits',
    description:
      'Whether attachments are available (global switch, every company) and ' +
      'the limits the client mirrors. A UI hint only: the server enforces ' +
      'everything again on every request.',
  })
  getConfig(@Req() req: AuthenticatedRequest) {
    return this.attachments.getClientConfig(req.user.sub);
  }

  // Guards run before interceptors: JWT + CSRF first, then the preflight
  // interceptor (authorization + limits), then the multipart parser that
  // streams the body to a temporary file.
  @Post('conversations/:id/attachments')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    ChatAttachmentUploadInterceptor,
    FileInterceptor(CHAT_ATTACHMENT_FIELD, {
      storage: attachmentTempStorage,
      // One more byte than the largest allowed file, so that an oversized
      // body is noticed by the engine's own counter (clear error) instead
      // of being silently truncated by the parser.
      limits: {
        fileSize: DB_CEILINGS.pdfBytes + 1,
        files: 1,
        fields: 0,
        parts: 2,
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload an attachment (not sent yet)',
    description:
      'Multipart field "file": PNG, JPEG, WebP (up to 5 MiB) or PDF (up to ' +
      '10 MiB). The type is decided from the content, not the name. The ' +
      'result is READY for a limited time; send it with `attachmentId` in ' +
      'POST /chat/conversations/:id/messages.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [CHAT_ATTACHMENT_FIELD],
      properties: {
        [CHAT_ATTACHMENT_FIELD]: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Not found / feature off.' })
  upload(
    @Req() req: AuthenticatedRequest,
    @Param() _params: ConversationIdParamDto,
    @UploadedFile()
    file: (Partial<StoredTempFile> & { originalname?: string }) | undefined,
  ) {
    const permit = getUploadPermit(req);

    if (!permit) throw new ForbiddenException();

    return this.attachments.completeUpload(permit, file ?? {});
  }

  @Get('conversations/:id/attachments/:attachmentId')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Download an attachment of a conversation you can access',
    description:
      'Streams the file. Images are served inline, PDFs only as a download. ' +
      'Every response carries nosniff and a sandboxing CSP.',
  })
  @ApiResponse({ status: 404, description: 'Not found / not accessible.' })
  async download(
    @Req() req: AuthenticatedRequest,
    @Param() params: AttachmentIdParamDto,
    @Res() res: Response,
  ): Promise<void> {
    const { row, opened } = await this.attachments.download(
      req.user.sub,
      params.id,
      params.attachmentId,
    );

    const etag = `"${row.sha256}"`;

    res.setHeader('ETag', etag);
    // Revalidated every time, so access removed later takes effect at once.
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    if (req.headers['if-none-match'] === etag) {
      opened.stream.destroy();
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    res.setHeader('Content-Type', row.contentType);
    res.setHeader('Content-Length', opened.size);
    res.setHeader(
      'Content-Disposition',
      // A PDF is never displayed by the browser from this endpoint.
      contentDispositionFor(
        row.kind === 'PDF' ? 'attachment' : 'inline',
        row.displayName,
      ),
    );
    res.status(HttpStatus.OK);

    try {
      await pipeline(opened.stream, res);
    } catch {
      // The client went away mid-transfer: the streams are already torn down.
      if (!res.writableEnded) res.destroy();
    }
  }

  @Delete('conversations/:id/attachments/:attachmentId')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Discard an attachment that has not been sent',
    description:
      'A sent (attached) file can never be removed through this call.',
  })
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param() params: AttachmentIdParamDto,
  ) {
    return this.attachments.cancel(
      req.user.sub,
      params.id,
      params.attachmentId,
    );
  }
}
