import { BadRequestException } from '@nestjs/common';

import { LeadConversionService } from './lead-conversion.service';

const audit = { actorUserId: 'a1' };

describe('LeadConversionService', () => {
  const makeService = () => {
    const repo = {
      preview: jest.fn().mockResolvedValue({ eligible: true }),
      convert: jest.fn().mockResolvedValue({ outcome: 'created' }),
    };
    return { repo, service: new LeadConversionService(repo) };
  };

  it('delegates preview with the caller company', async () => {
    const { repo, service } = makeService();
    await service.preview('c1', 'd1');
    expect(repo.preview).toHaveBeenCalledWith('c1', 'd1');
  });

  it('passes only the decision fields to the repository and defaults acknowledgeDuplicate to false', async () => {
    const { repo, service } = makeService();
    await service.convert('c1', 'd1', 'u1', { resolution: 'create' }, audit);
    expect(repo.convert).toHaveBeenCalledWith(
      'c1',
      'd1',
      'u1',
      {
        resolution: 'create',
        contactId: undefined,
        acknowledgeDuplicate: false,
      },
      audit,
    );
  });

  it('rejects link without contactId before touching the repository', () => {
    const { repo, service } = makeService();
    expect(() =>
      service.convert('c1', 'd1', 'u1', { resolution: 'link' }, audit),
    ).toThrow(BadRequestException);
    expect(repo.convert).not.toHaveBeenCalled();
  });
});
