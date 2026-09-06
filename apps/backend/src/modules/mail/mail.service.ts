import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const port = Number(this.configService.get<string>('MAIL_PORT'));

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port,
      // 465 is implicit TLS (secure: true) everywhere else (587/25 use
      // STARTTLS instead, negotiated after a plaintext connect, which is
      // what secure: false actually means to nodemailer). Hardcoding
      // false here meant a MAIL_PORT=465 deployment would silently try a
      // plaintext handshake against a TLS-only port instead of failing
      // loudly or working correctly.
      secure: port === 465,

      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASSWORD'),
      },
    });
  }

  async sendVerificationEmail(email: string, code: string): Promise<void> {
    const result = await this.transporter.sendMail({
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

    this.logger.log(
      `Verification email sent to ${email} (messageId=${result.messageId}, accepted=${result.accepted.length}, rejected=${result.rejected.length})`,
    );
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

    const result = await this.transporter.sendMail({
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

    this.logger.log(
      `Password reset email sent to ${email} (messageId=${result.messageId}, accepted=${result.accepted.length}, rejected=${result.rejected.length})`,
    );
  }
}
