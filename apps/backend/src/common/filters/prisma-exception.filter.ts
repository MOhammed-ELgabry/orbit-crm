import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(
    exception: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[])?.join(', ');

        throw new ConflictException(`${target ?? 'Record'} already exists.`);
      }

      case 'P2025':
        throw new NotFoundException('Record not found.');

      default:
        throw exception;
    }
  }
}
