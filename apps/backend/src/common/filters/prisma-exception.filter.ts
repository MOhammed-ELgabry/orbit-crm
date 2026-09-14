import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { captureException } from '@sentry/nestjs';

/**
 * Registered globally (see main.ts) ahead of HttpExceptionFilter so a
 * PrismaClientKnownRequestError that reaches this far (i.e. wasn't
 * already turned into a safe HttpException by a repository via
 * PrismaExceptionMapper) still gets a clean, safe JSON response instead
 * of a raw framework error.
 *
 * Important: an ExceptionFilter's catch() must write the response
 * itself — throwing from inside it is not caught by any other
 * registered filter and previously produced an inconsistent, potentially
 * unsafe response for exactly the errors this filter exists to handle.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url?: string }>();

    const { status, message } = this.mapException(exception);

    // Only the unmapped/unexpected case (falls through to the `default`
    // branch below, status 500) is actually a bug worth an alert — a
    // duplicate-email registration attempt (P2002) or a stale link to a
    // deleted contact (P2025) is an expected, already-handled outcome,
    // not something anyone needs paging for. This isn't an HttpException,
    // so it doesn't get HttpExceptionFilter's automatic
    // "don't report ordinary control flow" treatment — the same
    // distinction is made by hand here instead.
    if (status >= 500) {
      captureException(exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request?.url,
    });
  }

  private mapException(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
  } {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(
          ', ',
        );

        return {
          status: 409,
          message: `${target ?? 'Record'} already exists.`,
        };
      }

      case 'P2025':
        return { status: 404, message: 'Record not found.' };

      case 'P2003':
        return { status: 400, message: 'Invalid relation reference.' };

      default:
        // Deliberately generic — never forward exception.message (can
        // contain raw query/column details) to the client.
        return { status: 500, message: 'Internal server error' };
    }
  }
}