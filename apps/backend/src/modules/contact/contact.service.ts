import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CONTACT_REPOSITORY } from './constants/contact.constants';

import { CreateContactDto } from './dto/create-contact.dto';
import { ContactQueryDto } from './dto/contact-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ContactEntity } from './entities/contact.entity';

import type {
  ContactRepositoryResult,
  IContactRepository,
} from './repository/contact.repository.interface';

import { UserService } from '../user/user.service';

@Injectable()
export class ContactService {
  constructor(
    @Inject(CONTACT_REPOSITORY)
    private readonly contactRepository: IContactRepository,

    private readonly userService: UserService,
  ) {}

  /**
   * Ensures a client-supplied assignedToId actually belongs to the caller's
   * own company before it's ever written. UserService.findById already
   * enforces company scoping (throws NotFoundException otherwise), so a
   * cross-tenant id or a nonexistent id are indistinguishable to the caller
   * — neither is accepted, and neither reveals whether the id exists
   * elsewhere.
   */
  private async assertAssignableInCompany(
    assignedToId: string,
    companyId: string,
  ): Promise<void> {
    try {
      await this.userService.findById(assignedToId, companyId);
    } catch {
      throw new NotFoundException(
        `assignedToId "${assignedToId}" does not reference a user in this company.`,
      );
    }
  }

  async create(
    companyId: string,
    createdById: string,
    dto: CreateContactDto,
  ): Promise<ContactEntity> {
    if (dto.email) {
      const emailExists = await this.contactRepository.existsByEmail(
        companyId,
        dto.email,
      );

      if (emailExists) {
        throw new ConflictException(
          'A contact with this email already exists in this company.',
        );
      }
    }

    if (dto.assignedToId) {
      await this.assertAssignableInCompany(dto.assignedToId, companyId);
    }

    return this.contactRepository.create(companyId, createdById, dto);
  }

  async findAll(
    companyId: string,
    query: ContactQueryDto,
  ): Promise<ContactRepositoryResult> {
    return this.contactRepository.findAll(companyId, query);
  }

  async findById(companyId: string, contactId: string): Promise<ContactEntity> {
    const contact = await this.contactRepository.findById(companyId, contactId);

    if (!contact) {
      throw new NotFoundException(`Contact with ID "${contactId}" not found.`);
    }

    return contact;
  }

  async update(
    companyId: string,
    contactId: string,
    dto: UpdateContactDto,
  ): Promise<ContactEntity> {
    const existingContact = await this.contactRepository.findById(
      companyId,
      contactId,
    );

    if (!existingContact) {
      throw new NotFoundException(`Contact with ID "${contactId}" not found.`);
    }

    if (dto.email !== undefined && dto.email !== existingContact.email) {
      const emailExists = await this.contactRepository.existsByEmail(
        companyId,
        dto.email,
        contactId,
      );

      if (emailExists) {
        throw new ConflictException(
          'A contact with this email already exists in this company.',
        );
      }
    }

    if (dto.assignedToId) {
      await this.assertAssignableInCompany(dto.assignedToId, companyId);
    }

    const updatedContact = await this.contactRepository.update(
      companyId,
      contactId,
      dto,
    );

    if (!updatedContact) {
      throw new NotFoundException(`Contact with ID "${contactId}" not found.`);
    }

    return updatedContact;
  }

  async remove(companyId: string, contactId: string): Promise<void> {
    const deleted = await this.contactRepository.softDelete(
      companyId,
      contactId,
    );

    if (!deleted) {
      throw new NotFoundException(`Contact with ID "${contactId}" not found.`);
    }
  }
}
