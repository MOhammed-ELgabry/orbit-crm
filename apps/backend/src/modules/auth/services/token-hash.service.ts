import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

@Injectable()
export class TokenHashService {
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  compare(token: string, hash: string): boolean {
    const computedHash = Buffer.from(this.hash(token), 'hex');
    const providedHash = Buffer.from(hash, 'hex');

    if (computedHash.length !== providedHash.length) {
      return false;
    }

    return timingSafeEqual(computedHash, providedHash);
  }
}
