import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Put,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';

import { auditActorFromRequest } from '../audit/audit-actor.util';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Request, Response } from 'express';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserLanguageDto } from './dto/update-user-language.dto';
import { UpdateUserAppearanceDto } from './dto/update-user-appearance.dto';
import { UserEntity } from './entities/user.entity';
import { UserService } from './user.service';
import { AVATAR_FIELD, AVATAR_MAX_BYTES } from './avatar/avatar.constants';
import {
  UserAvatarService,
  type UploadedAvatarFile,
} from './avatar/avatar.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';
import { CsrfGuard } from '../../common/security/csrf.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@ApiTags('Users')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userAvatarService: UserAvatarService,
  ) {}

  @ApiOperation({
    summary: 'Create a new team member',
    description:
      'Owner-only. Creates a new user within the authenticated tenant ' +
      'company. The created user is active and email-verified ' +
      'immediately, so they can log in right away — this is the ' +
      'Owner-created counterpart to public self-registration, which ' +
      'still requires the normal email-verification flow.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully.',
    type: UserEntity,
  })
  @ApiForbiddenResponse({
    description: 'Owner privileges are required for this operation.',
  })
  @Post()
  @UseGuards(OwnerGuard, CsrfGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.create(
      dto,
      request.user.companyId,
      auditActorFromRequest(request),
    );
  }

  @ApiOperation({
    summary: 'Get all users',
    description:
      'Returns a paginated list of users belonging to the authenticated tenant company.',
  })
  @ApiOkResponse({
    description: 'Users retrieved successfully.',
  })
  @Get()
  async findAll(
    @Query() query: PaginationQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.findAll(query, request.user.companyId);
  }

  @ApiOperation({
    summary: 'Get user by id',
    description:
      'Returns a single user by identifier, scoped to the authenticated tenant company.',
  })
  @ApiOkResponse({
    description: 'User retrieved successfully.',
    type: UserEntity,
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.findById(id, request.user.companyId);
  }

  @ApiOperation({
    summary: 'Update own user profile',
    description:
      'Self-service profile update. A caller may only update their own ' +
      'profile (the :id path parameter must match the authenticated ' +
      "user's id) — this endpoint cannot be used to modify another " +
      'user, even within the same company.',
  })
  @ApiOkResponse({
    description: 'User updated successfully.',
    type: UserEntity,
  })
  @ApiForbiddenResponse({
    description: 'You can only update your own profile.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Patch(':id')
  @UseGuards(CsrfGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.update(
      id,
      dto,
      request.user.companyId,
      request.user.sub,
      auditActorFromRequest(request),
    );
  }

  @ApiOperation({
    summary: 'Upload or replace own profile picture',
    description:
      'Self-service. multipart/form-data with one image file in the ' +
      '"avatar" field (PNG, JPEG or WebP, at most 512 KB). A caller may ' +
      'only change their own picture (the :id path parameter must match ' +
      "the authenticated user's id). The file is identified by its " +
      'content, not its name or declared type.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [AVATAR_FIELD],
      properties: { [AVATAR_FIELD]: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({
    description: 'Picture saved. Returns the picture reference.',
  })
  @ApiForbiddenResponse({
    description: 'You can only change your own picture.',
  })
  @Put(':id/avatar')
  // Guards run before interceptors, so the CSRF check happens before the
  // upload body is parsed.
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor(AVATAR_FIELD, {
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 },
    }),
  )
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: UploadedAvatarFile | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userAvatarService.setOwn(
      id,
      request.user.sub,
      request.user.companyId,
      file,
    );
  }

  @ApiOperation({
    summary: 'Remove own profile picture',
    description:
      "Self-service. Removes the caller's own picture; the UI falls back " +
      'to initials. The :id path parameter must match the authenticated user.',
  })
  @ApiOkResponse({ description: 'Picture removed.' })
  @ApiForbiddenResponse({
    description: 'You can only remove your own picture.',
  })
  @Delete(':id/avatar')
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async removeAvatar(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userAvatarService.removeOwn(
      id,
      request.user.sub,
      request.user.companyId,
    );
  }

  @ApiOperation({
    summary: "Get a colleague's profile picture",
    description:
      'Returns the picture bytes. Authenticated and tenant-isolated: only ' +
      "pictures of users in the caller's own company are served; anything " +
      'else is a 404.',
  })
  @ApiOkResponse({ description: 'The image.' })
  @ApiNotFoundResponse({ description: 'Picture not found.' })
  @Get(':id/avatar')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async getAvatar(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    // The bytes are sent directly: the global ResponseInterceptor would
    // otherwise wrap them in the JSON envelope.
    @Res() res: Response,
  ) {
    const avatar = await this.userAvatarService.readForCompany(
      id,
      request.user.companyId,
    );

    const etag = `"${avatar.checksum}"`;

    res.setHeader('ETag', etag);
    // Private: the picture is for signed-in colleagues, never a shared cache.
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

    if (request.headers['if-none-match'] === etag) {
      res.status(HttpStatus.NOT_MODIFIED).end();
      return;
    }

    res.setHeader('Content-Type', avatar.contentType);
    res.setHeader('Content-Length', avatar.data.length);
    res.status(HttpStatus.OK).end(avatar.data);
  }

  @ApiOperation({
    summary: 'Update own language preference',
    description:
      'Self-service Settings update. A caller may only update their ' +
      'own language preference (the :id path parameter must match the ' +
      "authenticated user's id) — this endpoint cannot be used to " +
      "change another user's language, even within the same company.",
  })
  @ApiOkResponse({
    description: 'Language preference updated successfully.',
    type: UserEntity,
  })
  @ApiForbiddenResponse({
    description: 'You can only update your own language preference.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Patch(':id/language')
  @UseGuards(CsrfGuard)
  async updateLanguage(
    @Param('id') id: string,
    @Body() dto: UpdateUserLanguageDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.updateLanguage(
      id,
      dto,
      request.user.companyId,
      request.user.sub,
    );
  }

  @ApiOperation({
    summary: 'Update own appearance preference',
    description:
      'Self-service Settings update. A caller may only update their ' +
      'own background color preference (the :id path parameter must ' +
      "match the authenticated user's id) — this endpoint cannot be " +
      "used to change another user's appearance, even within the " +
      'same company. The foreground/text color is calculated ' +
      'automatically and is never part of this request or its ' +
      'response.',
  })
  @ApiOkResponse({
    description: 'Appearance preference updated successfully.',
    type: UserEntity,
  })
  @ApiForbiddenResponse({
    description: 'You can only update your own appearance preference.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Patch(':id/appearance')
  @UseGuards(CsrfGuard)
  async updateAppearance(
    @Param('id') id: string,
    @Body() dto: UpdateUserAppearanceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.updateAppearance(
      id,
      dto,
      request.user.companyId,
      request.user.sub,
    );
  }

  @ApiOperation({
    summary: 'Update user active status',
    description:
      'Owner-only. Activates or deactivates a user belonging to the authenticated tenant company.',
  })
  @ApiOkResponse({
    description: 'User status updated successfully.',
    type: UserEntity,
  })
  @ApiForbiddenResponse({
    description: 'Owner privileges are required for this operation.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Patch(':id/status')
  @UseGuards(OwnerGuard, CsrfGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.updateStatus(
      id,
      dto,
      request.user.companyId,
      auditActorFromRequest(request),
    );
  }

  @ApiOperation({
    summary: 'Assign or unassign a user’s role',
    description:
      'Owner-only. Assigns a role (by id) to a user belonging to the ' +
      'authenticated tenant company, or unassigns it by passing ' +
      'roleId: null. The roleId must belong to the same company — a ' +
      'role id from another tenant is rejected exactly like an unknown ' +
      'id, with no information about its existence elsewhere leaked.',
  })
  @ApiOkResponse({
    description: 'User role updated successfully.',
    type: UserEntity,
  })
  @ApiForbiddenResponse({
    description: 'Owner privileges are required for this operation.',
  })
  @ApiNotFoundResponse({
    description: 'User or role not found.',
  })
  @Patch(':id/role')
  @UseGuards(OwnerGuard, CsrfGuard)
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.userService.assignRole(
      id,
      dto.roleId,
      request.user.companyId,
      auditActorFromRequest(request),
    );
  }

  @ApiOperation({
    summary: 'Delete user',
    description:
      'Owner-only. Soft deletes a user belonging to the authenticated tenant company.',
  })
  @ApiOkResponse({
    description: 'User deleted successfully.',
  })
  @ApiForbiddenResponse({
    description: 'Owner privileges are required for this operation.',
  })
  @ApiNotFoundResponse({
    description: 'User not found.',
  })
  @Delete(':id')
  @UseGuards(OwnerGuard, CsrfGuard)
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.userService.delete(
      id,
      request.user.companyId,
      auditActorFromRequest(request),
    );
  }
}
