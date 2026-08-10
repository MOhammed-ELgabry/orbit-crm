import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { IJwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Authentication required.');
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authentication token.');
    }

    try {
      const payload = this.jwtService.verify<IJwtPayload>(token);

      request.user = payload;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }
}