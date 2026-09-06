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

  findAll(
    query: PaginationQueryDto,
    companyId: string,
  ): Promise<PaginationResult<UserEntity>>;

  /**
   * Unscoped lookup by id. Used only by AuthService's internal,
   * already-trusted flows (refresh token session, password reset
   * token) where ownership has already been proven by a signed
   * token rather than by tenant membership. Not used by any
   * client-facing User endpoint. Do not use this for tenant-scoped
   * access checks — use findByIdAndCompany instead.
   */
  findById(id: string): Promise<UserEntity | null>;

  /**
   * Tenant-scoped lookup used by every client-facing User endpoint.
   * Returns null both when the user does not exist and when it
   * belongs to a different company, so callers can produce a
   * uniform 404 without revealing cross-tenant existence.
   */
  findByIdAndCompany(id: string, companyId: string): Promise<UserEntity | null>;

  findByEmail(email: string): Promise<UserEntity | null>;

  findForAuthByEmail(email: string): Promise<IAuthUser | null>;

  update(
    id: string,
    companyId: string,
    data: UpdateUserRepositoryDto,
  ): Promise<UserEntity>;

  updateStatus(
    id: string,
    companyId: string,
    isActive: boolean,
  ): Promise<UserEntity>;

  updateRole(
    id: string,
    companyId: string,
    roleId: string | null,
  ): Promise<UserEntity>;

  updatePassword(id: string, passwordHash: string): Promise<void>;

  delete(id: string, companyId: string): Promise<void>;
}
