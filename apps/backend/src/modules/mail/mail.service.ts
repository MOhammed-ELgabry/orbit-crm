import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: this.configService.get<number>('MAIL_PORT'),
      secure: false,

      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.configService.get<string>('MAIL_FROM'),

      to: email,

      subject: 'Orbit CRM - Email Verification',

      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Welcome to Orbit CRM</h2>

          <p>Your verification code is:</p>

          <h1 style="
            letter-spacing: 6px;
            color: #2563eb;
          ">
            ${code}
          </h1>

          <p>
            This code will expire in
            <strong>10 minutes</strong>.
          </p>

          <hr />

          <small>
            If you didn't request this email,
            please ignore it.
          </small>
        </div>
      `,
    });
  }
}
