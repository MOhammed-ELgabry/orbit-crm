import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ms from 'ms';
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
import { OAuthStateService } from './services/oauth-state.service';

import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetBusinessTypeDto } from './dto/set-business-type.dto';
import {
  AUTH_REPOSITORY,
  AUTH_SESSION_REPOSITORY,
  PASSWORD_RESET_REPOSITORY,
  SOCIAL_ACCOUNT_REPOSITORY,
  ONBOARDING_TOKEN_REPOSITORY,
} from './constants/auth.constants';
import type { SocialProviderName } from './constants/auth.constants';
import { PrismaExceptionMapper } from '../../common/exceptions/prisma-exception.mapper';

import type { IAuthRepository } from './repository/auth.repository.interface';
import type { IAuthSessionRepository } from './repository/auth-session.repository.interface';
import type { IPasswordResetRepository } from './repository/password-reset.repository.interface';
import type { ISocialAccountRepository } from './repository/social-account.repository.interface';
import type { IOnboardingTokenRepository } from './repository/onboarding-token.repository.interface';
import type { ISocialAuthProvider } from './interfaces/social-profile.interface';

import { GoogleAuthProvider } from './providers/google-auth.provider';
import { FacebookAuthProvider } from './providers/facebook-auth.provider';
import { MicrosoftAuthProvider } from './providers/microsoft-auth.provider';

import { LoginDto } from './dto/login.dto';
import { IJwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Safe, client-facing user shape. Every auth endpoint that returns a user
 * (login, social callback, /auth/me) returns exactly this — never the
 * full entity, never a token.
 */
export interface ISafeAuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  isOwner: boolean;
}

/**
 * Internal result of issuing a new session. `accessToken`/`refreshToken`
 * here are for AuthController to turn into Set-Cookie headers — they are
 * never meant to be forwarded into a JSON response body. This type is not
 * used as an HTTP response shape.
 */
interface IIssuedSession {
  accessToken: string;
  refreshToken: string;
  user: ISafeAuthUser;
}

/**
 * handleSocialCallback()'s result. A social sign-in always gets a real
 * session (unlike the normal register→verify flow, verifyEmail() never
 * issues cookies) — but a brand-new social user still needs to go through
 * Business Type Selection before the dashboard, exactly like a normal
 * new user. `onboardingToken` is only present when `isNewUser` is true,
 * and is issued the same way — and consumed by the same setBusinessType()
 * endpoint — as the one verifyEmail() returns. Having a session already
 * doesn't change that: the ticket is a separate, narrowly-scoped
 * authorization for that one action, not a replacement for the session.
 */
interface ISocialCallbackResult extends IIssuedSession {
  isNewUser: boolean;
  onboardingToken?: string;
}

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

    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccountRepository: ISocialAccountRepository,

    @Inject(ONBOARDING_TOKEN_REPOSITORY)
    private readonly onboardingTokenRepository: IOnboardingTokenRepository,

    private readonly configService: ConfigService,

    private readonly tokenHashService: TokenHashService,

    private readonly oauthStateService: OAuthStateService,

    private readonly googleAuthProvider: GoogleAuthProvider,
    private readonly facebookAuthProvider: FacebookAuthProvider,
    private readonly microsoftAuthProvider: MicrosoftAuthProvider,

    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.userRepository.findByEmail(email);

    if (existingUser) {
      throw new BadRequestException('Email already exists.');
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
            companyId: null,
            pendingCompanyName: dto.companyName,
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

    if (user.isEmailVerified) {
      throw new BadRequestException('Email is already verified.');
    }

    const companyId = await this.prisma.$transaction(async (tx) => {
      // 1. Create the user's company
      const company = await tx.company.create({
        data: {
          name: `${user.firstName} ${user.lastName}'s Company`,
          contactEmail: user.email,
          isActive: true,
        },
      });

      // 2. Verify the email and attach the user to the company
      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          isEmailVerified: true,
          companyId: company.id,
          isOwner: true,
        },
      });

      // 3. Mark verification as completed
      await tx.emailVerification.update({
        where: {
          email,
        },
        data: {
          verifiedAt: new Date(),
        },
      });

      return company.id;
    });

    // The user has no session yet — verifyEmail() deliberately does not
    // authenticate them (that stays the explicit Login step's job). This
    // one-time token is what lets the very next step, Business Type
    // Selection, persist to the right company without one. See
    // OnboardingToken's doc comment in schema.prisma and setBusinessType()
    // below.
    const onboardingToken = await this.issueOnboardingToken(companyId);

    return {
      success: true,
      message: 'Email verified successfully. Your company has been created.',
      onboardingToken,
    };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const email = dto.email.trim().toLowerCase();

    const genericResponse = {
      success: true,
      message:
        'If an account with this email exists and is not yet verified, a new verification code has been sent.',
    };

    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      return genericResponse;
    }

    if (user.isEmailVerified) {
      return genericResponse;
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

    return genericResponse;
  }

  /**
   * Issues a fresh one-time onboarding ticket for `companyId`, deleting
   * any previous unused one for the same company first (mirrors
   * forgotPassword()'s deleteByUserId-then-create pattern, so re-verifying
   * or re-running social sign-up never leaves more than one live ticket
   * outstanding). Returns the raw token — store nothing but its hash.
   */
  private async issueOnboardingToken(companyId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.tokenHashService.hash(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await this.onboardingTokenRepository.deleteByCompanyId(companyId);

    await this.onboardingTokenRepository.create({
      companyId,
      tokenHash,
      expiresAt,
    });

    return token;
  }

  /**
   * Consumes a one-time onboarding token to record the company's chosen
   * business type. Deliberately does not require a session — see
   * OnboardingToken's doc comment in schema.prisma for why. Possession of
   * the (high-entropy, single-use, short-lived) raw token is the only
   * credential this checks.
   */
  async setBusinessType(
    dto: SetBusinessTypeDto,
  ): Promise<{ success: true; message: string }> {
    const tokenHash = this.tokenHashService.hash(dto.token);

    const onboardingToken =
      await this.onboardingTokenRepository.findByTokenHash(tokenHash);

    if (!onboardingToken) {
      throw new BadRequestException('Invalid or expired onboarding token.');
    }

    if (onboardingToken.usedAt) {
      throw new BadRequestException(
        'This onboarding step has already been completed.',
      );
    }

    if (onboardingToken.expiresAt <= new Date()) {
      throw new BadRequestException('Onboarding token has expired.');
    }

    try {
      await this.prisma.company.update({
        where: {
          id: onboardingToken.companyId,
        },
        data: {
          businessType: dto.businessType,
        },
      });
    } catch (error) {
      PrismaExceptionMapper.map(error);
    }

    await this.onboardingTokenRepository.markAsUsed(onboardingToken.id);

    return {
      success: true,
      message: 'Business type saved successfully.',
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
      ) as any,
    });
  }

  /**
   * Verifies credentials and issues a new session. Returns the raw tokens
   * for AuthController to set as cookies — see IIssuedSession. Never
   * return this value directly as an HTTP response body.
   */
  async login(dto: LoginDto): Promise<IIssuedSession> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.authRepository.findUserForLogin(email);

    if (!user) {
      throw new BadRequestException('Invalid email or password.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Invalid email or password.');
    }

    const isPasswordValid = await this.passwordService.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new BadRequestException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new BadRequestException('User account is inactive.');
    }

    if (!user.isEmailVerified) {
      throw new BadRequestException('Email is not verified.');
    }
    if (!user.companyId) {
      throw new BadRequestException('User is not associated with a company.');
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
    );

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
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isOwner: user.isOwner,
      },
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

  /**
   * Rotates a refresh session. `refreshToken` is the raw value read from
   * the HttpOnly cookie by AuthController — this method never reads a
   * request body. Returns the new tokens for the controller to set as
   * cookies (see IIssuedSession's doc comment — never return this as a
   * JSON body).
   */
  async refresh(refreshToken: string): Promise<Omit<IIssuedSession, 'user'>> {
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
      // Reuse of a refresh token that was already rotated away is a
      // strong signal of compromise (the token was copied and is now
      // being replayed by someone other than — or racing — its
      // legitimate holder). Rather than just rejecting this one attempt,
      // proactively kill every session this user has, so a stolen-but-
      // detected token can't be quietly ridden out.
      await this.authSessionRepository.revokeAllByUserId(session.userId);

      throw new BadRequestException('Refresh token has been revoked.');
    }

    if (session.expiresAt <= new Date()) {
      throw new BadRequestException('Refresh token has expired.');
    }

    if (!this.tokenHashService.compare(refreshToken, session.tokenHash)) {
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
    if (!user.companyId) {
      throw new BadRequestException('User is not associated with a company.');
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

    const newRefreshToken = this.generateRefreshToken(newRefreshTokenPayload);

    const newRefreshTokenHash = this.tokenHashService.hash(newRefreshToken);

    const newRefreshTokenExpiresIn = this.configService.getOrThrow<string>(
      'jwt.refreshExpiresIn',
    );

    const newRefreshTokenExpiresAt = new Date(
      Date.now() + ms(newRefreshTokenExpiresIn),
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
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Ends a session. Deliberately lenient: a missing, malformed, expired,
   * or already-revoked refresh token all just mean "there's nothing left
   * to revoke" rather than an error — the caller's intent (no longer be
   * logged in) is satisfied either way, and AuthController clears the
   * cookies unconditionally regardless of what happens here.
   */
  async logout(
    refreshToken: string | undefined,
  ): Promise<{ success: true; message: string }> {
    const response = { success: true as const, message: 'Logout successful.' };

    if (!refreshToken) {
      return response;
    }

    let payload: IRefreshTokenPayload;

    try {
      payload = this.jwtService.verify<IRefreshTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      return response;
    }

    const session = await this.authSessionRepository.findById(
      payload.sessionId,
    );

    if (session && !session.revokedAt) {
      await this.authSessionRepository.revoke(payload.sessionId);
    }

    return response;
  }

  /**
   * Returns the safe, client-facing shape of the currently authenticated
   * user. Used both for /auth/me (session restoration on the frontend)
   * and anywhere else "who am I" is needed.
   */
  async getCurrentUser(userId: string): Promise<{
    success: true;
    message: string;
    user: ISafeAuthUser;
  }> {
    const user = await this.userRepository.findById(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is no longer available.');
    }

    return {
      success: true,
      message: 'Current user retrieved successfully.',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isOwner: user.isOwner,
      },
    };
  }

  private resolveSocialProvider(
    provider: SocialProviderName,
  ): ISocialAuthProvider {
    switch (provider) {
      case 'google':
        return this.googleAuthProvider;
      case 'facebook':
        return this.facebookAuthProvider;
      case 'microsoft':
        return this.microsoftAuthProvider;
      default:
        throw new BadRequestException('Unsupported social provider.');
    }
  }

  /**
   * Builds the URL the popup should navigate to for the given provider.
   * Throws ServiceUnavailableException (not a boot-time failure) if that
   * provider's env vars aren't configured, so an unconfigured provider
   * simply can't be started rather than crashing the app.
   */
  async getSocialAuthorizeUrl(provider: SocialProviderName): Promise<string> {
    const providerService = this.resolveSocialProvider(provider);

    if (!providerService.isConfigured()) {
      throw new ServiceUnavailableException(
        `${provider} sign-in is not configured.`,
      );
    }

    const state = this.oauthStateService.generate(provider);

    return providerService.getAuthorizeUrl(state);
  }

  /**
   * Handles the provider's redirect back to our backend callback. Verifies
   * CSRF state, verifies the identity server-side via the provider's own
   * SDK/API, resolves or creates the local User exactly the way
   * verifyEmail() does today, then issues an access/refresh token pair
   * using the SAME generateAccessToken/generateRefreshToken/AuthSession
   * mechanism login() already uses — no second token system. Returns the
   * raw tokens for AuthController to set as cookies directly on this
   * callback response — see IIssuedSession's doc comment.
   */
  async handleSocialCallback(
    provider: SocialProviderName,
    code: string,
    state: string,
  ): Promise<ISocialCallbackResult> {
    const providerService = this.resolveSocialProvider(provider);

    if (!providerService.isConfigured()) {
      throw new ServiceUnavailableException(
        `${provider} sign-in is not configured.`,
      );
    }

    if (!this.oauthStateService.verify(provider, state)) {
      throw new BadRequestException(
        'Invalid or expired authentication request.',
      );
    }

    const profile = await providerService.getProfile(code);

    if (!profile.email) {
      throw new BadRequestException(
        'This provider did not return an email address required to sign in.',
      );
    }

    // Scenario 4 — refuse unsafe automatic account creation/linking when
    // the provider cannot establish a trustworthy verified email.
    if (!profile.emailVerified) {
      throw new BadRequestException(
        'This provider did not confirm a verified email address. Please use a different sign-in method.',
      );
    }

    const email = profile.email.trim().toLowerCase();

    const existingSocialAccount =
      await this.socialAccountRepository.findByProviderAccount(
        provider,
        profile.providerAccountId,
      );

    let userId: string;
    // Only Scenario 1 (brand-new user + brand-new company) needs the
    // Business Type Selection step — Scenarios 2/3 are an existing Orbit
    // CRM user who (by definition) already has a company and, if they
    // needed to, already went through onboarding.
    let isNewUser = false;

    if (existingSocialAccount) {
      // Scenario 2 — existing social identity, straightforward login.
      const user = await this.userRepository.findById(
        existingSocialAccount.userId,
      );

      if (!user) {
        throw new BadRequestException('Associated account no longer exists.');
      }

      userId = user.id;
    } else {
      const existingUser = await this.userRepository.findByEmail(email);

      if (existingUser) {
        // Scenario 3 — same verified email as an existing Orbit CRM user.
        // We link rather than create a duplicate. This is safe specifically
        // because we only reach this branch when profile.emailVerified is
        // true (checked above) — an unverified provider email is never
        // used to link into an existing account (Scenario 4).
        await this.socialAccountRepository.create({
          provider,
          providerAccountId: profile.providerAccountId,
          email,
          userId: existingUser.id,
        });

        userId = existingUser.id;
      } else {
        isNewUser = true;

        // Scenario 1 — brand-new social user. Mirrors verifyEmail(): a new
        // Company is created and the user becomes its owner. Email/password
        // login is not disabled for this user — they can set a password
        // later via "forgot password" if they ever want to.
        const createdUserId = await this.prisma.$transaction(async (tx) => {
          const company = await tx.company.create({
            data: {
              name: `${profile.firstName} ${profile.lastName}'s Company`,
              contactEmail: email,
              isActive: true,
            },
          });

          const createdUser = await tx.user.create({
            data: {
              firstName: profile.firstName,
              lastName: profile.lastName,
              email,
              passwordHash: null,
              avatar: profile.avatar,
              isEmailVerified: true,
              companyId: company.id,
              isOwner: true,
            },
          });

          await tx.socialAccount.create({
            data: {
              provider,
              providerAccountId: profile.providerAccountId,
              email,
              userId: createdUser.id,
            },
          });

          return createdUser.id;
        });

        userId = createdUserId;
      }
    }

    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new BadRequestException('Associated account no longer exists.');
    }

    if (!user.isActive) {
      throw new BadRequestException('User account is inactive.');
    }

    if (!user.companyId) {
      throw new BadRequestException('User is not associated with a company.');
    }

    // From here down this is deliberately identical to login()'s token
    // issuance — same JWT payload shape, same AuthSession mechanism.
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
    );

    const refreshTokenExpiresAt = new Date(
      Date.now() + ms(refreshTokenExpiresIn),
    );

    await this.authSessionRepository.create({
      id: sessionId,
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: refreshTokenExpiresAt,
    });

    // A brand-new social user already has a session (cookies are set on
    // this same response by AuthController) but still hasn't picked a
    // business type. Issue the same one-time ticket verifyEmail() issues
    // so the frontend can send them through the identical Business Type
    // Selection step/endpoint before the dashboard.
    const onboardingToken = isNewUser
      ? await this.issueOnboardingToken(user.companyId)
      : undefined;

    return {
      accessToken,
      refreshToken,
      isNewUser,
      onboardingToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isOwner: user.isOwner,
      },
    };
  }
}