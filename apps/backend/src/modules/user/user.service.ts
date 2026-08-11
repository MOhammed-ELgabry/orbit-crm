import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import { USER_REPOSITORY } from './constants/user.constants';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRepositoryDto } from './dto/update-user-repository.dto';
import { CreateUserRepositoryDto } from './dto/create-user-repository.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

import type { IUserRepository } from './repository/user.repository.interface';

import { PasswordService } from './services/password.service';

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,

    private readonly passwordService: PasswordService,
  ) {}

  async create(dto: CreateUserDto, companyId: string) {
    const repositoryDto: CreateUserRepositoryDto = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,

      passwordHash: await this.passwordService.hash(dto.password),

      phone: dto.phone ?? null,
      avatar: dto.avatar ?? null,

      // Tenant identity and ownership are never client-controlled.
      companyId,
      isOwner: false,
    };

    return this.userRepository.create(repositoryDto);
  }

  async findAll(query: PaginationQueryDto, companyId: string) {
    return this.userRepository.findAll(query, companyId);
  }

  async findById(id: string, companyId: string) {
    const user = await this.userRepository.findByIdAndCompany(id, companyId);

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found.`);
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async update(id: string, dto: UpdateUserDto, companyId: string) {
    // Ensures the target belongs to the caller's company; throws the
    // same NotFoundException used cross-tenant, matching CompanyService.
    await this.findById(id, companyId);

    const repositoryDto: UpdateUserRepositoryDto = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
      avatar: dto.avatar ?? null,
    };

    if (dto.password) {
      repositoryDto.passwordHash = await this.passwordService.hash(
        dto.password,
      );
    }

    return this.userRepository.update(id, companyId, repositoryDto);
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, companyId: string) {
    await this.findById(id, companyId);

    return this.userRepository.updateStatus(id, companyId, dto.isActive);
  }

  async delete(id: string, companyId: string) {
    await this.findById(id, companyId);

    return this.userRepository.delete(id, companyId);
  }
}
