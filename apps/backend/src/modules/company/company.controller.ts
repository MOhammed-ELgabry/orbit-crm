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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PaginationResult } from '../../common/interfaces/pagination-result.interface';

import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyEntity } from './entities/company.entity';
import { CompanyService } from './company.service';

@ApiTags('Company')
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new company',
    description:
      'Creates a new company and returns the created company.',
  })
  @ApiCreatedResponse({
    description: 'Company created successfully.',
    type: CompanyEntity,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed.',
  })
  async create(
    @Body() createCompanyDto: CreateCompanyDto,
  ): Promise<CompanyEntity> {
    return this.companyService.create(createCompanyDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all companies',
    description:
      'Returns a paginated list of companies.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 20,
  })
  @ApiOkResponse({
    description: 'Companies retrieved successfully.',
  })
  async findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginationResult<CompanyEntity>> {
    return this.companyService.findAll(query);
  }

  @Patch(':id')
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
  async update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ): Promise<CompanyEntity> {
    return this.companyService.update(
      id,
      updateCompanyDto,
    );
  }

  @Delete(':id')
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
  async delete(
    @Param('id') id: string,
  ): Promise<void> {
    return this.companyService.delete(id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get company by ID',
    description:
      'Returns a single company using its unique identifier.',
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
  ): Promise<CompanyEntity> {
    return this.companyService.findById(id);
  }
}