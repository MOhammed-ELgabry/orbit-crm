import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        const isPaginated =
          data && typeof data === 'object' && 'data' in data && 'meta' in data;

        if (isPaginated) {
          return {
            success: true,
            statusCode: response.statusCode,
            message: 'Request completed successfully.',
            data: data.data,
            meta: data.meta,
            timestamp: new Date().toISOString(),
          };
        }

        // Some handlers (AuthController's register/verify-email/login/etc.)
        // already return a fully-formed envelope of their own —
        // { success, message, ...fields } — built with an
        // endpoint-specific message ("Login successful.") and fields the
        // frontend reads directly off the response (e.g. `user`,
        // `onboardingToken`). Re-wrapping that whole object under another
        // `data` key would silently move every one of those fields one
        // level deeper than any caller expects, without any error to
        // signal it. Detect that shape and pass it through instead of
        // nesting it — only filling in statusCode/timestamp, which these
        // handlers don't set themselves.
        const isPreEnveloped =
          data !== null &&
          typeof data === 'object' &&
          typeof (data as { success?: unknown }).success === 'boolean';

        if (isPreEnveloped) {
          return {
            statusCode: response.statusCode,
            timestamp: new Date().toISOString(),
            ...data,
          };
        }

        return {
          success: true,
          statusCode: response.statusCode,
          message: 'Request completed successfully.',
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}