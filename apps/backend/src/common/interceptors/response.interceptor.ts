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
