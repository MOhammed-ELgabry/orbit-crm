import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

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

  async update(
    id: string,
    dto: UpdateUserDto,
    companyId: string,
    callerId: string,
  ) {
    // This is a self-service endpoint: the authenticated caller may only
    // ever update their own profile. Checked first, before any lookup,
    // so a caller probing arbitrary ids always gets the same generic
    // 403 regardless of whether that id exists at all, in this company
    // or another — no existence information is leaked. This is what
    // stops one company member from overwriting another member's
    // (including the owner's) password: id === callerId is required.
    if (id !== callerId) {
      throw new ForbiddenException('You can only update your own profile.');
    }

    // Existence + tenant check. In practice always true now that id ===
    // callerId is enforced above, but kept as a direct, defense-in-depth
    // confirmation the account still exists — matches CompanyService's
    // existing pattern.
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