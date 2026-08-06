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

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';

    const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(
      resetToken,
    )}`;

    await this.transporter.sendMail({
      from: this.configService.get<string>('MAIL_FROM'),

      to: email,

      subject: 'Orbit CRM - Reset Your Password',

      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Reset Your Orbit CRM Password</h2>

          <p>
            We received a request to reset your password.
          </p>

          <p>
            Click the button below to create a new password:
          </p>

          <div style="margin: 30px 0;">
            <a
              href="${resetUrl}"
              style="
                display: inline-block;
                padding: 12px 24px;
                background-color: #2563eb;
                color: #ffffff;
                text-decoration: none;
                border-radius: 6px;
              "
            >
              Reset Password
            </a>
          </div>

          <p>
            This link will expire according to the password
            reset token expiration configured by the application.
          </p>

          <hr />

          <small>
            If you didn't request a password reset,
            please ignore this email.
          </small>
        </div>
      `,
    });
  }
}
