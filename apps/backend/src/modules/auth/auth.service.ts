import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms, { type StringValue } from 'ms';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { IRefreshTokenPayload } from './interfaces/refresh-token-payload.interface';
import { USER_REPOSITORY } from '../user/constants/user.constants';
import { EMAIL_VERIFICATION_REPOSITORY } from '../email-verification/constants/email-verification.constants';
import { randomBytes, randomUUID } from 'crypto';

import type { IUserRepository } from '../user/repository/user.repository.interface';
import type { IEmailVerificationRepository } from '../email-verification/repository/email-verification.repository.interface';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { PasswordService } from '../user/services/password.service';
import { MailService } from '../mail/mail.service';
import { TokenHashService } from './services/token-hash.service';

import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  AUTH_REPOSITORY,
  AUTH_SESSION_REPOSITORY,
  PASSWORD_RESET_REPOSITORY,
} from './constants/auth.constants';

import type { IAuthRepository } from './repository/auth.repository.interface';
import type { IAuthSessionRepository } from './repository/auth-session.repository.interface';
import type { IPasswordResetRepository } from './repository/password-reset.repository.interface';

import { LoginDto } from './dto/login.dto';
import { IJwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly maxVerificationAttempts = 5;

  constructor(
    private readonly prisma: PrismaService,

    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,

    @Inject(EMAIL_VERIFICATION_REPOSITORY)
    private readonly emailVerificationRepository: IEmailVerificationRepository,

    private readonly passwordService: PasswordService,

    private readonly mailService: MailService,

    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,

    @Inject(AUTH_SESSION_REPOSITORY)
    private readonly authSessionRepository: IAuthSessionRepository,

    @Inject(PASSWORD_RESET_REPOSITORY)
    private readonly passwordResetRepository: IPasswordResetRepository,

    private readonly configService: ConfigService,

    private readonly tokenHashService: TokenHashService,

    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new BadRequestException('Email already exists.');
    }

    const company = await this.prisma.company.findFirst({
      where: {
        id: dto.companyId,
        isActive: true,
        deletedAt: null,
      },
    });

    if (!company) {
      throw new NotFoundException('Active company not found.');
    }

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();

    const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      await this.prisma.$transaction(async (tx) => {
        const userWithSameEmail = await tx.user.findUnique({
          where: {
            email,
          },
          select: {
            id: true,
          },
        });

        if (userWithSameEmail) {
          throw new BadRequestException('Email already exists.');
        }

        await tx.user.create({
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            email,
            passwordHash,
            phone: dto.phone,
            avatar: dto.avatar,
            companyId: dto.companyId,
            isOwner: dto.isOwner ?? false,
          },
        });

        await tx.emailVerification.create({
          data: {
            email,
            code: verificationCode,
            expiresAt: verificationExpiresAt,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Email already exists.');
      }

      throw error;
    }

    await this.mailService.sendVerificationEmail(email, verificationCode);

    return {
      success: true,
      message: 'Registration successful. Please verify your email.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const email = dto.email.trim().toLowerCase();

    const verification =
      await this.emailVerificationRepository.findByEmail(email);

    if (!verification) {
      throw new NotFoundException('Verification request not found.');
    }

    if (verification.verifiedAt) {
      throw new BadRequestException('Email is already verified.');
    }

    if (verification.attempts >= this.maxVerificationAttempts) {
      throw new BadRequestException('Maximum verification attempts exceeded.');
    }

    if (verification.expiresAt < new Date()) {
      throw new BadRequestException('Verification code has expired.');
    }

    if (verification.code !== dto.code) {
      await this.emailVerificationRepository.incrementAttempts(email);

      throw new BadRequestException('Invalid verification code.');
    }

    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          isEmailVerified: true,
        },
      });

      await tx.emailVerification.update({
        where: {
          email,
        },
        data: {
          verifiedAt: new Date(),
        },
      });
    });

    return {
      success: true,
      message: 'Email verified successfully.',
    };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified.');
    }

    const verificationCode = Math.floor(
      100000 + Math.random() * 900000,
    ).toString();

    const verificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.emailVerificationRepository.create({
      email,
      code: verificationCode,
      expiresAt: verificationExpiresAt,
    });

    await this.mailService.sendVerificationEmail(email, verificationCode);

    return {
      success: true,
      message: 'Verification code resent successfully.',
    };
  }

  private generateAccessToken(payload: IJwtPayload): string {
    return this.jwtService.sign(payload);
  }

  private generateRefreshToken(payload: IRefreshTokenPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      expiresIn: this.configService.getOrThrow<string>(
        'jwt.refreshExpiresIn',
      ) as StringValue,
    });
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.authRepository.findUserForLogin(email);

    if (!user) {
      throw new BadRequestException('Invalid email or password.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new BadRequestException('User account is inactive.');
    }

    const isPasswordValid = await this.passwordService.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new BadRequestException('Invalid email or password.');
    }

    if (!user.isEmailVerified) {
      throw new BadRequestException('Email is not verified.');
    }

    const accessTokenPayload: IJwtPayload = {
      sub: user.id,
      companyId: user.companyId,
      email: user.email,
      isOwner: user.isOwner,
    };

    const accessToken = this.generateAccessToken(accessTokenPayload);

    const sessionId = randomUUID();

    const refreshTokenPayload: IRefreshTokenPayload = {
      sub: user.id,
      sessionId,
    };

    const refreshToken = this.generateRefreshToken(refreshTokenPayload);
    const refreshTokenHash = this.tokenHashService.hash(refreshToken);

    const refreshTokenExpiresIn = this.configService.getOrThrow<string>(
      'jwt.refreshExpiresIn',
    ) as StringValue;

    const refreshTokenExpiresAt = new Date(
      Date.now() + ms(refreshTokenExpiresIn),
    );

    await this.authSessionRepository.create({
      id: sessionId,
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: refreshTokenExpiresAt,
    });

    return {
      success: true,
      message: 'Login successful.',
      accessToken,
      refreshToken,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.authRepository.findUserForLogin(email);

    if (!user) {
      return {
        success: true,
        message:
          'If an account with this email exists, a password reset link has been sent.',
      };
    }

    if (!user.isActive) {
      return {
        success: true,
        message:
          'If an account with this email exists, a password reset link has been sent.',
      };
    }

    const resetToken = randomBytes(32).toString('hex');

    const tokenHash = this.tokenHashService.hash(resetToken);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.passwordResetRepository.deleteByUserId(user.id);

    await this.passwordResetRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    await this.mailService.sendPasswordResetEmail(user.email, resetToken);

    return {
      success: true,
      message:
        'If an account with this email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.tokenHashService.hash(dto.token);

    const resetToken =
      await this.passwordResetRepository.findByTokenHash(tokenHash);

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException(
        'Password reset token has already been used.',
      );
    }

    if (resetToken.expiresAt <= new Date()) {
      throw new BadRequestException('Password reset token has expired.');
    }

    const user = await this.userRepository.findById(resetToken.userId);

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    if (!user.isActive) {
      throw new BadRequestException('User account is inactive.');
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);

    await this.userRepository.updatePassword(user.id, passwordHash);

    await this.authSessionRepository.revokeAllByUserId(user.id);

    await this.passwordResetRepository.markAsUsed(resetToken.id);

    return {
      success: true,
      message: 'Password has been reset successfully.',
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const { refreshToken } = dto;

    let payload: IRefreshTokenPayload;

    try {
      payload = this.jwtService.verify<IRefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new BadRequestException('Invalid refresh token.');
    }

    const session = await this.authSessionRepository.findById(
      payload.sessionId,
    );

    if (!session) {
      throw new BadRequestException('Invalid refresh token.');
    }

    if (session.revokedAt) {
      throw new BadRequestException('Refresh token has been revoked.');
    }

    if (session.expiresAt <= new Date()) {
      throw new BadRequestException('Refresh token has expired.');
    }

    const refreshTokenHash = this.tokenHashService.hash(refreshToken);

    if (refreshTokenHash !== session.tokenHash) {
      throw new BadRequestException('Invalid refresh token.');
    }

    const user = await this.userRepository.findById(session.userId);

    if (!user) {
      throw new BadRequestException('Invalid refresh token.');
    }

    if (!user.isActive) {
      throw new BadRequestException('User account is inactive.');
    }

    if (!user.isEmailVerified) {
      throw new BadRequestException('Email is not verified.');
    }

    const accessTokenPayload: IJwtPayload = {
      sub: user.id,
      companyId: user.companyId,
      email: user.email,
      isOwner: user.isOwner,
    };

    const accessToken = this.generateAccessToken(accessTokenPayload);

    const newSessionId = randomUUID();

    const newRefreshTokenPayload: IRefreshTokenPayload = {
      sub: user.id,
      sessionId: newSessionId,
    };

    const newRefreshToken = this.generateRefreshToken(
      newRefreshTokenPayload,
    );

    const newRefreshTokenHash = this.tokenHashService.hash(newRefreshToken);

    const newRefreshTokenExpiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    );

    const rotatedSession = await this.authSessionRepository.rotate(
      payload.sessionId,
      {
        id: newSessionId,
        userId: user.id,
        tokenHash: newRefreshTokenHash,
        expiresAt: newRefreshTokenExpiresAt,
      },
    );

    if (!rotatedSession) {
      throw new BadRequestException('Invalid refresh token.');
    }

    return {
      success: true,
      message: 'Access token refreshed successfully.',
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(dto: LogoutDto) {
    const { refreshToken } = dto;

    let payload: IRefreshTokenPayload;

    try {
      payload = this.jwtService.verify<IRefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new BadRequestException('Invalid refresh token.');
    }

    const session = await this.authSessionRepository.findById(
      payload.sessionId,
    );

    if (!session) {
      throw new BadRequestException('Invalid refresh token.');
    }

    if (session.revokedAt) {
      throw new BadRequestException('Refresh token has already been revoked.');
    }

    const refreshTokenHash = this.tokenHashService.hash(refreshToken);

    if (refreshTokenHash !== session.tokenHash) {
      throw new BadRequestException('Invalid refresh token.');
    }

    await this.authSessionRepository.revoke(payload.sessionId);

    return {
      success: true,
      message: 'Logout successful.',
    };
  }
}