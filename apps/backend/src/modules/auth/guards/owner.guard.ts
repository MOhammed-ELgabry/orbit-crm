import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { Request } from 'express';

import type { IJwtPayload } from '../interfaces/jwt-payload.interface';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication context is missing.');
    }

    if (!user.isOwner) {
      throw new ForbiddenException(
        'Owner privileges are required for this operation.',
      );
    }

    return true;
  }
}
