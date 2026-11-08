import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';

import { CreateLeadDto } from './create-lead.dto';
import { LeadQueryDto } from './lead-query.dto';
import { UpdateLeadDto } from './update-lead.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
});

const run = (
  metatype: new () => object,
  type: 'body' | 'query',
  value: unknown,
) => pipe.transform(value, { type, metatype });

describe('lead status validation', () => {
  it('a client cannot create a lead as "converted"', async () => {
    await expect(
      run(CreateLeadDto, 'body', {
        firstName: 'A',
        lastName: 'B',
        status: 'converted',
      }),
    ).rejects.toThrow();
  });

  it('a client cannot update a lead to "converted"', async () => {
    await expect(
      run(UpdateLeadDto, 'body', { status: 'converted' }),
    ).rejects.toThrow();
  });

  it('ordinary statuses are still writable', async () => {
    await expect(
      run(UpdateLeadDto, 'body', { status: 'qualified' }),
    ).resolves.toBeDefined();
  });

  it('but the list can be filtered by "converted"', async () => {
    await expect(
      run(LeadQueryDto, 'query', { status: 'converted' }),
    ).resolves.toBeDefined();
  });
});
