import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CsrfGuard } from '../../common/security/csrf.guard';

import { NotificationIdParamDto } from './dto/notification-id-param.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  SubscribePushDto,
  UnsubscribePushDto,
} from './dto/push-subscription.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { NotificationService } from './notification.service';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

/**
 * Notifications are the caller's OWN data, not a business resource, so
 * there is deliberately no PermissionsGuard / `notification:*`
 * permission: every handler is scoped by the verified JWT's `sub` AND
 * `companyId` (JwtAuthGuard), and state-changing handlers also require
 * the CSRF token (CsrfGuard).
 */
@ApiTags('Notifications')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'List my notifications',
    description: 'Paginated notifications of the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'Notifications retrieved.' })
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notificationService.findAll(
      req.user.companyId,
      req.user.sub,
      query,
    );
  }

  @Get('unread-count')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get my unread notification count' })
  @ApiResponse({ status: 200, description: 'Unread count.' })
  getUnreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationService.getUnreadCount(
      req.user.companyId,
      req.user.sub,
    );
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Get my notification preferences',
    description: "Channel opt-ins plus the caller's registered push devices.",
  })
  getPreferences(@Req() req: AuthenticatedRequest) {
    return this.notificationService.getPreferences(
      req.user.companyId,
      req.user.sub,
    );
  }

  @Put('preferences')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Enable/disable a notification channel for me' })
  updatePreference(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.notificationService.updatePreference(
      req.user.companyId,
      req.user.sub,
      dto,
    );
  }

  @Get('push/public-key')
  @ApiOperation({ summary: 'Get the VAPID public key for Web Push' })
  @ApiResponse({ status: 503, description: 'Web Push is not configured.' })
  getPushPublicKey() {
    return this.notificationService.getPushPublicKey();
  }

  @Post('push/subscribe')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register this browser/device for Web Push' })
  subscribePush(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubscribePushDto,
  ) {
    return this.notificationService.subscribePush(
      req.user.companyId,
      req.user.sub,
      dto,
    );
  }

  @Post('push/unsubscribe')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Remove this browser/device from Web Push' })
  unsubscribePush(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UnsubscribePushDto,
  ) {
    return this.notificationService.unsubscribePush(
      req.user.companyId,
      req.user.sub,
      dto,
    );
  }

  @Post('read-all')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.notificationService.markAllRead(
      req.user.companyId,
      req.user.sub,
    );
  }

  @Patch(':id/read')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Mark one of my notifications as read' })
  @ApiResponse({ status: 404, description: 'Notification not found.' })
  markRead(
    @Req() req: AuthenticatedRequest,
    @Param() params: NotificationIdParamDto,
  ) {
    return this.notificationService.markRead(
      req.user.companyId,
      req.user.sub,
      params.id,
    );
  }
}
