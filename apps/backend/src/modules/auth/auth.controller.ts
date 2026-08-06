import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';

import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({
    summary: 'Register a new account',
    description: 'Creates a new account and sends an email verification code.',
  })
  @ApiCreatedResponse({
    description: 'Registration completed successfully.',
  })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
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
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @ApiOperation({
    summary: 'Login to account',
    description: 'Authenticates a user using email and password.',
  })
  @ApiOkResponse({
    description: 'Login successful.',
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Generates a new access token using a valid refresh token.',
  })
  @ApiOkResponse({
    description: 'Access token refreshed successfully.',
  })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @ApiOperation({
    summary: 'Logout from account',
    description:
      'Revokes the current refresh token session and logs the user out.',
  })
  @ApiOkResponse({
    description: 'Logout successful.',
  })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
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
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
