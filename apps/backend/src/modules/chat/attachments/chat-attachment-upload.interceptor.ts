import {
  BadRequestException,
  type CallHandler,
  ForbiddenException,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request } from 'express';
import { finalize, from, switchMap, type Observable } from 'rxjs';

import type { IJwtPayload } from '../../auth/interfaces/jwt-payload.interface';

import { setUploadContext } from './attachment-upload.storage-engine';
import { ATTACHMENT_ERRORS } from './chat-attachments.constants';
import {
  ChatAttachmentsService,
  type UploadPermit,
} from './chat-attachments.service';

type UploadRequest = Request & {
  user?: IJwtPayload;
  chatAttachmentPermit?: UploadPermit;
};

const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function getUploadPermit(request: unknown): UploadPermit | undefined {
  return (request as UploadRequest | undefined)?.chatAttachmentPermit;
}

/**
 * Placed in front of the multipart parser. Guards (JWT, CSRF) have already
 * run; here the caller and the conversation are authorised through the
 * existing chat access path and the limits are checked, all BEFORE the first
 * byte of the body is read. Only an accepted request gets an upload context,
 * and the storage engine refuses to write without one.
 *
 * The concurrency slot taken by the preflight is released when the request
 * ends in any way (success, error, client abort).
 */
@Injectable()
export class ChatAttachmentUploadInterceptor implements NestInterceptor {
  constructor(private readonly service: ChatAttachmentsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<UploadRequest>();
    const userId = request.user?.sub;
    const conversationId = request.params?.id;

    if (!userId) throw new ForbiddenException();

    if (
      typeof conversationId !== 'string' ||
      !CONVERSATION_ID.test(conversationId)
    ) {
      throw new BadRequestException(ATTACHMENT_ERRORS.invalidUpload);
    }

    // A client that announces a body beyond any limit is refused at once.
    // (The engine still counts the real bytes: this header can lie.)
    return from(this.service.preflightUpload(userId, conversationId)).pipe(
      switchMap((permit) => {
        const announced = Number(request.headers['content-length']);

        if (
          Number.isFinite(announced) &&
          announced > permit.maxBytes + 64 * 1024
        ) {
          permit.release();
          throw new PayloadTooLargeException(ATTACHMENT_ERRORS.tooLarge);
        }

        request.chatAttachmentPermit = permit;

        setUploadContext(request, {
          tempPath: permit.tempPath,
          maxBytes: permit.maxBytes,
          tooLarge: () =>
            new PayloadTooLargeException(ATTACHMENT_ERRORS.tooLarge),
          failed: () =>
            new BadRequestException(ATTACHMENT_ERRORS.invalidUpload),
        });

        return next.handle().pipe(finalize(() => permit.release()));
      }),
    );
  }
}
