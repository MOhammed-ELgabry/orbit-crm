import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';

import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';

import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SetBusinessTypeDto } from './dto/set-business-type.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

import { SOCIAL_PROVIDERS } from './constants/auth.constants';
import type { SocialProviderName } from './constants/auth.constants';
import { renderSocialAuthCallbackPage } from './utils/social-callback-page.util';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { IJwtPayload } from './interfaces/jwt-payload.interface';
import { CsrfGuard } from '../../common/security/csrf.guard';
import {
  AUTH_COOKIE_NAMES,
  buildAccessTokenCookieOptions,
  buildClearCookieOptions,
  buildCsrfTokenCookieOptions,
  buildRefreshTokenCookieOptions,
} from './utils/cookie-options.util';

type AuthenticatedRequest = Request & { user: IJwtPayload };

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Sets the access, refresh, and CSRF cookies on `res`. Used by every
   * endpoint that issues or rotates a session (login, refresh, social
   * callback) so the cookie policy can never drift between them — see
   * cookie-options.util.ts for the actual attribute values.
   */
  private setSessionCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    const csrfToken = randomBytes(32).toString('hex');

    res.cookie(
      AUTH_COOKIE_NAMES.accessToken,
      accessToken,
      buildAccessTokenCookieOptions(this.configService),
    );

    res.cookie(
      AUTH_COOKIE_NAMES.refreshToken,
      refreshToken,
      buildRefreshTokenCookieOptions(this.configService),
    );

    res.cookie(
      AUTH_COOKIE_NAMES.csrfToken,
      csrfToken,
      buildCsrfTokenCookieOptions(this.configService),
    );
  }

  private clearSessionCookies(res: Response): void {
    res.clearCookie(
      AUTH_COOKIE_NAMES.accessToken,
      buildClearCookieOptions(this.configService, 'access'),
    );

    res.clearCookie(
      AUTH_COOKIE_NAMES.refreshToken,
      buildClearCookieOptions(this.configService, 'refresh'),
    );

    res.clearCookie(
      AUTH_COOKIE_NAMES.csrfToken,
      buildClearCookieOptions(this.configService, 'csrf'),
    );
  }

  @ApiOperation({
    summary: 'Register a new account',
    description: 'Creates a new account and sends an email verification code.',
  })
  @ApiCreatedResponse({
    description: 'Registration completed successfully.',
  })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({
    summary: 'Verify email address',
    description: 'Verifies the email using the 6-digit verification code.',
  })
  @ApiOkResponse({
    description: 'Email verified successfully.',
  })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @ApiOperation({
    summary: 'Resend verification code',
    description:
      'Generates a new verification code and sends it to the user email.',
  })
  @ApiOkResponse({
    description: 'Verification code resent successfully.',
  })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @ApiOperation({
    summary: 'Set the company business type (onboarding)',
    description:
      "Consumes the one-time onboarding token returned by verify-email " +
      "(or a new social sign-up) to record the company's selected " +
      'business type. Deliberately unauthenticated — the user has no ' +
      'session yet at this point in the required flow (that is ' +
      'established by the explicit Login step that follows). Possession ' +
      'of the token, not a cookie, is the credential here — see ' +
      'OnboardingToken in schema.prisma.',
  })
  @ApiOkResponse({
    description: 'Business type saved successfully.',
  })
  @Post('business-type')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async setBusinessType(@Body() dto: SetBusinessTypeDto) {
    return this.authService.setBusinessType(dto);
  }

  @ApiOperation({
    summary: 'Login to account',
    description:
      'Authenticates a user using email and password. On success, sets ' +
      'HttpOnly session cookies — the response body never contains a token.',
  })
  @ApiOkResponse({
    description: 'Login successful.',
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(dto);

    this.setSessionCookies(res, accessToken, refreshToken);

    return {
      success: true,
      message: 'Login successful.',
      user,
    };
  }

  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Sends a password reset link if an account exists with the provided email.',
  })
  @ApiOkResponse({
    description: 'Password reset request processed successfully.',
  })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 15 * 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @ApiOperation({
    summary: 'Refresh session',
    description:
      'Rotates the session using the HttpOnly refresh cookie and issues a ' +
      'new access cookie. Requires a matching X-CSRF-Token header.',
  })
  @ApiOkResponse({
    description: 'Session refreshed successfully.',
  })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[AUTH_COOKIE_NAMES.refreshToken] as
      string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException('No active session to refresh.');
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await this.authService.refresh(refreshToken);

    this.setSessionCookies(res, accessToken, newRefreshToken);

    return {
      success: true,
      message: 'Access token refreshed successfully.',
    };
  }

  @ApiOperation({
    summary: 'Logout from account',
    description:
      'Revokes the current session and clears the session cookies. ' +
      'Requires a matching X-CSRF-Token header.',
  })
  @ApiOkResponse({
    description: 'Logout successful.',
  })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[AUTH_COOKIE_NAMES.refreshToken] as
      string | undefined;

    const result = await this.authService.logout(refreshToken);

    this.clearSessionCookies(res);

    return result;
  }

  @ApiOperation({
    summary: 'Reset account password',
    description:
      'Resets the account password using a valid password reset token.',
  })
  @ApiOkResponse({
    description: 'Password reset successfully.',
  })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get the current authenticated user',
    description:
      'Returns the safe profile of the user identified by the session ' +
      'cookie (or Authorization header). Used by the frontend to restore ' +
      'session state on load, since it no longer has direct access to a ' +
      'decodable token.',
  })
  @ApiOkResponse({
    description: 'Current user retrieved successfully.',
  })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentUser(@Req() req: AuthenticatedRequest) {
    return this.authService.getCurrentUser(req.user.sub);
  }

  private assertValidProvider(provider: string): SocialProviderName {
    if (!SOCIAL_PROVIDERS.includes(provider as SocialProviderName)) {
      // Rendered as a normal JSON 400 here (not the popup HTML page) —
      // this only happens for a malformed/unsupported :provider segment,
      // before we'd even know which frontend origin to trust for a
      // postMessage response.
      throw new BadRequestException('Unsupported social provider.');
    }

    return provider as SocialProviderName;
  }

  @ApiExcludeEndpoint()
  @Get('social/:provider/start')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async socialStart(@Param('provider') provider: string, @Res() res: Response) {
    const validProvider = this.assertValidProvider(provider);

    const authorizeUrl =
      await this.authService.getSocialAuthorizeUrl(validProvider);

    return res.redirect(authorizeUrl);
  }

  @ApiExcludeEndpoint()
  @Get('social/:provider/callback')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async socialCallback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const validProvider = this.assertValidProvider(provider);

    const frontendOrigin = this.configService.getOrThrow<string>('frontendUrl');

    try {
      if (error) {
        throw new BadRequestException(
          'Authentication was cancelled or denied.',
        );
      }

      if (!code || !state) {
        throw new BadRequestException('Invalid authentication callback.');
      }

      const { accessToken, refreshToken, user, isNewUser, onboardingToken } =
        await this.authService.handleSocialCallback(validProvider, code, state);

      // Cookies are set on THIS response — the popup's own top-level
      // navigation to our domain — so they're already present for the
      // whole browser (including the opener tab) before the inline
      // script below even runs. onboardingToken is NOT a session
      // credential (see OnboardingToken in schema.prisma) so sending it
      // in the payload alongside the cookie-based session is fine — it
      // authorizes exactly one thing (the business-type step) and only
      // exists at all when isNewUser is true.
      this.setSessionCookies(res, accessToken, refreshToken);

      return res.send(
        renderSocialAuthCallbackPage(frontendOrigin, {
          type: 'orbit-social-auth-success',
          payload: { user, isNewUser, onboardingToken },
        }),
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Authentication failed.';

      return res.send(
        renderSocialAuthCallbackPage(frontendOrigin, {
          type: 'orbit-social-auth-error',
          payload: { message },
        }),
      );
    }
  }
}