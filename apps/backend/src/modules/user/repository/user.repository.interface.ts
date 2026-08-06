import { Prisma } from '@prisma/client';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PaginationResult } from '../../../common/interfaces/pagination-result.interface';

import { CreateUserRepositoryDto } from '../dto/create-user-repository.dto';
import { UpdateUserRepositoryDto } from '../dto/update-user-repository.dto';

import { UserEntity } from '../entities/user.entity';
import { IAuthUser } from '../../auth/interfaces/auth-user.interface';

export interface IUserRepository {
  create(data: CreateUserRepositoryDto): Promise<UserEntity>;

  createWithTransaction(
    tx: Prisma.TransactionClient,
    data: CreateUserRepositoryDto,
  ): Promise<UserEntity>;

  findAll(query: PaginationQueryDto): Promise<PaginationResult<UserEntity>>;

  findById(id: string): Promise<UserEntity | null>;

  findByEmail(email: string): Promise<UserEntity | null>;

  findForAuthByEmail(email: string): Promise<IAuthUser | null>;

  update(id: string, data: UpdateUserRepositoryDto): Promise<UserEntity>;

  updatePassword(id: string, passwordHash: string): Promise<void>;

  delete(id: string): Promise<void>;
}
