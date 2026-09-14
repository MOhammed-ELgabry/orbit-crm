import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';

import { IJwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

type MaybeAuthenticatedRequest = Request & { user?: IJwtPayload };

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  @Sentry.SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost): void {
    // اطبع الخطأ الحقيقي في التيرمينال
    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error(String(exception));
    }

    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<MaybeAuthenticatedRequest>();

    // Opaque ids only (already attached by JwtAuthGuard for any
    // authenticated request) — never email, never a token. This just
    // lets a Sentry issue say "N distinct users, these companies" the
    // same way it would for any other app; it adds no new way of
    // reading or storing credentials. @SentryExceptionCaptured() above
    // decides whether this exception actually gets reported (plain
    // HttpExceptions like NotFoundException/ForbiddenException are
    // skipped as ordinary control flow) — setting this unconditionally
    // is fine either way, since it only affects events that do get sent.
    if (request.user) {
      Sentry.setUser({ id: request.user.sub });
      Sentry.setTag('companyId', request.user.companyId);
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message = 'Internal server error';

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (exceptionResponse && typeof exceptionResponse === 'object') {
      const error = exceptionResponse as {
        message?: string | string[];
      };

      if (Array.isArray(error.message)) {
        message = error.message.join(', ');
      } else if (error.message) {
        message = error.message;
      }
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}