import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

import {
  USER_REPOSITORY,
  BASIC_PLAN_USER_LIMIT,
} from './constants/user.constants';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRepositoryDto } from './dto/update-user-repository.dto';
import { CreateUserRepositoryDto } from './dto/create-user-repository.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

import type { IUserRepository } from './repository/user.repository.interface';

import { PasswordService } from './services/password.service';
import { RoleService } from '../role/role.service';

import { AUTH_SESSION_REPOSITORY } from '../auth/constants/auth.constants';
import type { IAuthSessionRepository } from '../auth/repository/auth-session.repository.interface';

@Injectable()
export class UserService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,

    private readonly passwordService: PasswordService,

    private readonly roleService: RoleService,

    @Inject(AUTH_SESSION_REPOSITORY)
    private readonly authSessionRepository: IAuthSessionRepository,
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

      // This endpoint is reached only by an authenticated Owner
      // creating a team member (see OwnerGuard on
      // UserController.create) — not by public self-registration,
      // which goes through AuthService.register()/verifyEmail() and is
      // untouched by this. A team member created this way has no
      // pending EmailVerification row and no way to reach the normal
      // verification flow, so requiring it here would leave them
      // permanently unable to log in. isActive/isEmailVerified are
      // therefore forced true here — server-side, not client input:
      // CreateUserDto has no isActive/isEmailVerified field, so there
      // is nothing in `dto` that could ever reach this object.
      isActive: true,
      isEmailVerified: true,
    };

    return this.userRepository.createWithinCompanyLimit(
      repositoryDto,
      BASIC_PLAN_USER_LIMIT,
    );
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

    const updated = await this.userRepository.update(
      id,
      companyId,
      repositoryDto,
    );

    if (dto.password) {
      // Mirrors AuthService.resetPassword(), which already revokes
      // every session after a successful password change — without
      // this, a stolen-but-valid session would survive a legitimate
      // user changing their password from their own profile instead
      // of using "forgot password". Runs only after the update above
      // has resolved (a failed update throws before this line is
      // reached, so a failed password change never revokes anything),
      // and only when this call actually changed the password (a
      // plain profile edit with no `password` field never revokes
      // anything). id === callerId was already enforced above, so
      // this can only ever revoke the caller's own sessions.
      //
      // Deliberately not wrapped in a transaction with the update
      // above: resetPassword() already established the precedent for
      // this exact sequence — plain sequential awaits, no rollback if
      // revocation fails after the password itself was successfully
      // changed. The password change is the security-critical outcome
      // and stands on its own; a transient revocation failure surfaces
      // as a thrown error rather than silently discarding an already-
      // successful password change.
      await this.authSessionRepository.revokeAllByUserId(id);
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto, companyId: string) {
    await this.findById(id, companyId);

    return this.userRepository.updateStatus(id, companyId, dto.isActive);
  }

  async assignRole(id: string, roleId: string | null, companyId: string) {
    await this.findById(id, companyId);

    if (roleId !== null) {
      // RoleService.findById throws NotFoundException if roleId doesn't
      // exist OR belongs to a different company — a role id from
      // another tenant is rejected exactly like an unknown one, the
      // same "behaves as if it doesn't exist" treatment already used
      // for assignedToId on Contact.
      await this.roleService.findById(companyId, roleId);
    }

    return this.userRepository.updateRole(id, companyId, roleId);
  }

  async delete(id: string, companyId: string) {
    await this.findById(id, companyId);

    return this.userRepository.delete(id, companyId);
  }
}
