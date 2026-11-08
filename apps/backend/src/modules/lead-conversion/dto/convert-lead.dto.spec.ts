import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';

import { ConvertLeadDto } from './convert-lead.dto';

// Same options as the app's global pipe (see main.ts).
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const run = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: ConvertLeadDto });

describe('ConvertLeadDto', () => {
  it('accepts create', async () => {
    await expect(run({ resolution: 'create' })).resolves.toMatchObject({
      resolution: 'create',
    });
  });

  it('accepts create with acknowledgeDuplicate', async () => {
    await expect(
      run({ resolution: 'create', acknowledgeDuplicate: true }),
    ).resolves.toBeDefined();
  });

  it('accepts link with a contactId and trims it', async () => {
    await expect(
      run({ resolution: 'link', contactId: '  c1  ' }),
    ).resolves.toMatchObject({ contactId: 'c1' });
  });

  it.each([
    [{}],
    [{ resolution: 'merge' }],
    [{ resolution: 'link' }],
    [{ resolution: 'link', contactId: '   ' }],
    [{ resolution: 'create', acknowledgeDuplicate: 'yes' }],
  ])('rejects %j', async (body) => {
    await expect(run(body)).rejects.toThrow();
  });

  it.each(['companyId', 'leadId', 'firstName', 'status', 'createdById'])(
    'rejects an unknown property (%s) — the client never supplies data or tenant',
    async (field) => {
      await expect(
        run({ resolution: 'create', [field]: 'x' }),
      ).rejects.toThrow();
    },
  );
});
