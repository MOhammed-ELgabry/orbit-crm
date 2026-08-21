import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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

import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CsrfGuard } from '../../common/security/csrf.guard';

import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ContactQueryDto } from './dto/contact-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@ApiTags('Contacts')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Create contact',
    description:
      'Creates a new contact inside the authenticated tenant company.',
  })
  @ApiResponse({
    status: 201,
    description: 'Contact created successfully.',
  })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactService.create(req.user.companyId, req.user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get contacts',
    description:
      'Returns paginated contacts scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contacts retrieved successfully.',
  })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: ContactQueryDto,
  ) {
    return this.contactService.findAll(req.user.companyId, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get contact by id',
    description:
      'Returns a single contact scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found.',
  })
  async findById(
    @Req() req: AuthenticatedRequest,
    @Param('id') contactId: string,
  ) {
    return this.contactService.findById(req.user.companyId, contactId);
  }

  @Patch(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Update contact',
    description:
      'Updates a contact scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found.',
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') contactId: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactService.update(req.user.companyId, contactId, dto);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Delete contact',
    description:
      'Soft deletes a contact scoped to the authenticated tenant company.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contact deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Contact not found.',
  })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') contactId: string,
  ): Promise<void> {
    return this.contactService.remove(req.user.companyId, contactId);
  }
}
