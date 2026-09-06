import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import type { Request } from 'express';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginationResult } from '../../common/interfaces/pagination-result.interface';

import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyEntity } from './entities/company.entity';
import { CompanyService } from './company.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';
import type { IJwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CsrfGuard } from '../../common/security/csrf.guard';

type AuthenticatedRequest = Request & {
  user: IJwtPayload;
};

@ApiTags('Company')
@ApiExtraModels(PaginationQueryDto)
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @UseGuards(CsrfGuard)
  @ApiOperation({
    summary: 'Create a new company',
    description:
      'Creates a new company. This endpoint is currently restricted until Platform-level authorization is implemented.',
  })
  @ApiCreatedResponse({
    description: 'Company created successfully.',
    type: CompanyEntity,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed.',
  })
  @ApiForbiddenResponse({
    description: 'Company creation is not available to tenant users.',
  })
  async create(
    @Body() createCompanyDto: CreateCompanyDto,
  ): Promise<CompanyEntity> {
    /*
     * Company creation is a Platform-level operation.
     *
     * Tenant users must not be able to create new companies.
     * Platform Admin / onboarding authorization will be added
     * when the RBAC phase is implemented.
     */
    throw new ForbiddenException(
      'Company creation is not available to tenant users.',
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get current company',
    description: 'Returns companies visible to the authenticated tenant.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 20,
    description: 'Number of items per page',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    example: 'Orbit',
    description: 'Search by company name or email',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    example: 'createdAt',
    description: 'Field used for sorting',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    example: 'desc',
    description: 'Sorting direction',
  })
  @ApiOkResponse({
    description: 'Companies retrieved successfully.',
  })
  async findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginationResult<CompanyEntity>> {
    return this.companyService.findAll(query, request.user.companyId);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get the authenticated user’s own company',
    description:
      'Convenience alias for GET /companies/:id that never requires the ' +
      'caller to already know their own companyId — it is taken ' +
      'directly from the authenticated session. Used by the frontend to ' +
      'resolve businessType for dashboard routing; must be declared ' +
      'ahead of GET /companies/:id or Nest would match “me” as an id.',
  })
  @ApiOkResponse({
    description: 'Company retrieved successfully.',
    type: CompanyEntity,
  })
  async findMine(
    @Req() request: AuthenticatedRequest,
  ): Promise<CompanyEntity> {
    return this.companyService.findById(
      request.user.companyId,
      request.user.companyId,
    );
  }

  @Patch(':id')
  @UseGuards(OwnerGuard, CsrfGuard)
  @ApiOperation({
    summary: 'Update company',
    description: 'Updates an existing company.',
  })
  @ApiParam({
    name: 'id',
    description: 'Company unique identifier.',
    example: 'cmf8m3v8j0000l704q9i8v4bx',
  })
  @ApiOkResponse({
    description: 'Company updated successfully.',
    type: CompanyEntity,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed.',
  })
  @ApiNotFoundResponse({
    description: 'Company not found.',
  })
  @ApiForbiddenResponse({
    description: 'Owner privileges are required for this operation.',
  })
  async update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CompanyEntity> {
    return this.companyService.update(
      id,
      updateCompanyDto,
      request.user.companyId,
    );
  }

  @Delete(':id')
  @UseGuards(OwnerGuard, CsrfGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete company',
    description: 'Soft deletes a company.',
  })
  @ApiParam({
    name: 'id',
    description: 'Company unique identifier.',
    example: 'cmf8m3v8j0000l704q9i8v4bx',
  })
  @ApiNoContentResponse({
    description: 'Company deleted successfully.',
  })
  @ApiNotFoundResponse({
    description: 'Company not found.',
  })
  @ApiForbiddenResponse({
    description: 'Owner privileges are required for this operation.',
  })
  async delete(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.companyService.delete(id, request.user.companyId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get company by ID',
    description: 'Returns a single company using its unique identifier.',
  })
  @ApiParam({
    name: 'id',
    description: 'Company unique identifier.',
    example: 'cmf8m3v8j0000l704q9i8v4bx',
  })
  @ApiOkResponse({
    description: 'Company retrieved successfully.',
    type: CompanyEntity,
  })
  @ApiNotFoundResponse({
    description: 'Company not found.',
  })
  async findById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<CompanyEntity> {
    return this.companyService.findById(id, request.user.companyId);
  }
}