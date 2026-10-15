import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
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

import { ChatService } from './chat.service';
import { ConversationIdParamDto } from './dto/conversation-id-param.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { OpenDirectConversationDto } from './dto/open-direct.dto';
import { ReceiptsQueryDto } from './dto/receipts-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { TeammatesQueryDto } from './dto/teammates-query.dto';

type AuthenticatedRequest = Request & { user: IJwtPayload };

/**
 * Team chat is the caller's own, company-internal communication — not a
 * business resource — so, like notifications, there is deliberately NO
 * PermissionsGuard / `chat:*` permission and no change to RBAC. Authorization
 * is the chat-specific layer in ChatService/ChatEligibilityService, which
 * re-reads the caller's CURRENT user + company state from the database on
 * every call. Only the verified JWT `sub` is used from the token; the
 * company, participants and sender are always derived on the server.
 *
 * State-changing handlers also require the CSRF token (CsrfGuard), exactly
 * like the rest of the cookie-authenticated API.
 */
@ApiTags('Chat')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('session')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Chat session probe',
    description:
      'Cheap authenticated call used by the client to (re)validate its ' +
      'session before opening the real-time socket.',
  })
  getSession(@Req() req: AuthenticatedRequest) {
    return this.chatService.getSession(req.user.sub);
  }

  @Get('bootstrap')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Chat bootstrap',
    description:
      'Conversations (with unread counts), teammates (with presence) and ' +
      'the caller identity. Also the recovery call after a reconnect.',
  })
  getBootstrap(@Req() req: AuthenticatedRequest) {
    return this.chatService.getBootstrap(req.user.sub);
  }

  @Get('conversations')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'List my conversations' })
  listConversations(@Req() req: AuthenticatedRequest) {
    return this.chatService.listConversations(req.user.sub);
  }

  @Get('teammates')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'List eligible teammates (with presence)' })
  listTeammates(
    @Req() req: AuthenticatedRequest,
    @Query() query: TeammatesQueryDto,
  ) {
    return this.chatService.listTeammates(req.user.sub, query);
  }

  @Post('conversations/direct')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Open (or create) the direct conversation with a teammate',
    description:
      'Idempotent: the same pair always resolves to the same conversation.',
  })
  openDirect(
    @Req() req: AuthenticatedRequest,
    @Body() dto: OpenDirectConversationDto,
  ) {
    return this.chatService.openDirectConversation(req.user.sub, dto.userId);
  }

  @Get('conversations/:id/messages')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Message history (cursor pagination by sequence)',
  })
  @ApiResponse({ status: 404, description: 'Not found / not a participant.' })
  getMessages(
    @Req() req: AuthenticatedRequest,
    @Param() params: ConversationIdParamDto,
    @Query() query: MessagesQueryDto,
  ) {
    return this.chatService.getMessages(req.user.sub, params.id, query);
  }

  @Get('conversations/:id/receipts')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Read receipts of my own messages in a range' })
  getReceipts(
    @Req() req: AuthenticatedRequest,
    @Param() params: ConversationIdParamDto,
    @Query() query: ReceiptsQueryDto,
  ) {
    return this.chatService.getReceipts(
      req.user.sub,
      params.id,
      query.from,
      query.to,
    );
  }

  @Post('conversations/:id/messages')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 90, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Send a message (idempotent by clientMessageId)',
    description:
      'The sender, company, audience and sequence are derived on the ' +
      'server. Re-sending the same clientMessageId returns the stored ' +
      'message with `duplicate: true` and publishes nothing.',
  })
  sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param() params: ConversationIdParamDto,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(req.user.sub, params.id, dto);
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Acknowledge that messages were visible (moves my read cursor)',
  })
  markRead(
    @Req() req: AuthenticatedRequest,
    @Param() params: ConversationIdParamDto,
    @Body() dto: MarkReadDto,
  ) {
    return this.chatService.markRead(req.user.sub, params.id, dto.upToSequence);
  }
}
