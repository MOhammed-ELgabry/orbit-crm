import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import { USER_REPOSITORY } from './constants/user.constants';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRepositoryDto } from './dto/update-user-repository.dto';
import { CreateUserRepositoryDto } from './dto/create-user-repository.dto';
import { UpdateUserDto } from './dto/update-user.dto';

import type { IUserRepository } from './repository/user.repository.interface';

import { PasswordService } from './services/password.service';

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,

    private readonly passwordService: PasswordService,
  ) {}

  async create(dto: CreateUserDto) {
    const repositoryDto: CreateUserRepositoryDto = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,

      passwordHash: await this.passwordService.hash(dto.password),

      phone: dto.phone ?? null,
      avatar: dto.avatar ?? null,
      companyId: dto.companyId,
      isOwner: dto.isOwner ?? false,
    };

    return this.userRepository.create(repositoryDto);
  }

  async findAll(query: PaginationQueryDto) {
    return this.userRepository.findAll(query);
  }

  async findById(id: string) {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found.`);
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.userRepository.findByEmail(email);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);

    const repositoryDto: UpdateUserRepositoryDto = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone ?? null,
      avatar: dto.avatar ?? null,
      isOwner: dto.isOwner,
      isActive: dto.isActive,
    };

    if (dto.password) {
      repositoryDto.passwordHash = await this.passwordService.hash(
        dto.password,
      );
    }

    return this.userRepository.update(id, repositoryDto);
  }

  async delete(id: string) {
    await this.findById(id);

    return this.userRepository.delete(id);
  }
}
