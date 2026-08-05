import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

export class PrismaExceptionMapper {
  static map(error: unknown): never {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      throw error;
    }

    switch (error.code) {
      case 'P2002': {
        const fields = (error.meta?.target as string[] | undefined)?.join(', ');

        throw new ConflictException(`${fields ?? 'Record'} already exists.`);
      }

      case 'P2025':
        throw new NotFoundException('Record not found.');

      case 'P2003':
        throw new BadRequestException('Invalid relation reference.');

      default:
        throw error;
    }
  }
}
