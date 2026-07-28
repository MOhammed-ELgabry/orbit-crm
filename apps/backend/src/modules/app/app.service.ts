import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService,
  ) { }

  getHello(): string {
    const port = this.configService.get<string>('PORT');

    return `Application is running on port ${port}`;
  }
}
