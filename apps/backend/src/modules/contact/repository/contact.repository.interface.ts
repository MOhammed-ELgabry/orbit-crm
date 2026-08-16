import { ContactEntity } from '../entities/contact.entity';
import { CreateContactDto } from '../dto/create-contact.dto';
import { UpdateContactDto } from '../dto/update-contact.dto';
import { ContactQueryDto } from '../dto/contact-query.dto';

export interface ContactRepositoryResult {
  data: ContactEntity[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface IContactRepository {
  create(
    companyId: string,
    createdById: string,
    dto: CreateContactDto,
  ): Promise<ContactEntity>;

  findAll(
    companyId: string,
    query: ContactQueryDto,
  ): Promise<ContactRepositoryResult>;

  findById(companyId: string, contactId: string): Promise<ContactEntity | null>;

  update(
    companyId: string,
    contactId: string,
    dto: UpdateContactDto,
  ): Promise<ContactEntity | null>;

  softDelete(companyId: string, contactId: string): Promise<boolean>;

  existsByEmail(
    companyId: string,
    email: string,
    excludeContactId?: string,
  ): Promise<boolean>;
}
