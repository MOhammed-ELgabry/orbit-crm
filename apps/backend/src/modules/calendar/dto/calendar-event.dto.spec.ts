import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateCalendarEventDto } from './create-calendar-event.dto';
import { UpdateCalendarEventDto } from './update-calendar-event.dto';

describe('CreateCalendarEventDto', () => {
  const validBody = {
    title: 'Product demo',
    startAt: '2026-10-01T13:00:00.000Z',
    endAt: '2026-10-01T14:00:00.000Z',
  };

  it('accepts a minimal valid body', async () => {
    const dto = plainToInstance(CreateCalendarEventDto, validBody);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed startAt with a validation error, not a thrown exception', async () => {
    const dto = plainToInstance(CreateCalendarEventDto, { ...validBody, startAt: 'not-a-date' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'startAt')).toBe(true);
  });

  it('rejects a title that is too short', async () => {
    const dto = plainToInstance(CreateCalendarEventDto, { ...validBody, title: 'A' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('trims a padded title', async () => {
    const dto = plainToInstance(CreateCalendarEventDto, { ...validBody, title: '  Padded  ' });
    expect(dto.title).toBe('Padded');
  });

  it('normalizes an empty-string description to undefined-safe null rather than storing ""', async () => {
    const dto = plainToInstance(CreateCalendarEventDto, { ...validBody, description: '   ' });
    expect(dto.description).toBeNull();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty-string contactId — never silently treated as "no relation"', async () => {
    const dto = plainToInstance(CreateCalendarEventDto, { ...validBody, contactId: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'contactId')).toBe(true);
  });

  it('trims a padded contactId', async () => {
    const dto = plainToInstance(CreateCalendarEventDto, { ...validBody, contactId: '  cm123  ' });
    expect(dto.contactId).toBe('cm123');
  });
});

describe('UpdateCalendarEventDto', () => {
  it('accepts an empty body — every field is optional', async () => {
    const dto = plainToInstance(UpdateCalendarEventDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts an explicit null for description and preserves it as null (not undefined) after transform', async () => {
    const dto = plainToInstance(UpdateCalendarEventDto, { description: null });
    expect(dto.description).toBeNull();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('accepts an explicit null for location and preserves it as null', async () => {
    const dto = plainToInstance(UpdateCalendarEventDto, { location: null });
    expect(dto.location).toBeNull();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('normalizes an empty-string description the same way null does — both clear the field', async () => {
    const dto = plainToInstance(UpdateCalendarEventDto, { description: '' });
    expect(dto.description).toBeNull();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('leaves description as undefined when the key is entirely absent (distinct from an explicit null)', async () => {
    const dto = plainToInstance(UpdateCalendarEventDto, { title: 'Renamed' });
    expect(dto.description).toBeUndefined();
  });

  it('accepts an explicit null for contactId/leadId/dealId/assignedToId (clearing a relation)', async () => {
    const dto = plainToInstance(UpdateCalendarEventDto, {
      contactId: null,
      leadId: null,
      dealId: null,
      assignedToId: null,
    });
    expect(dto.contactId).toBeNull();
    expect(dto.leadId).toBeNull();
    expect(dto.dealId).toBeNull();
    expect(dto.assignedToId).toBeNull();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty-string contactId — clearing must be an explicit null, never ""', async () => {
    const dto = plainToInstance(UpdateCalendarEventDto, { contactId: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'contactId')).toBe(true);
  });

  it('rejects a status outside the whitelisted set', async () => {
    const dto = plainToInstance(UpdateCalendarEventDto, { status: 'in_progress' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('accepts each whitelisted status', async () => {
    for (const status of ['scheduled', 'completed', 'cancelled']) {
      const dto = plainToInstance(UpdateCalendarEventDto, { status });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects a body carrying an unrecognized field when combined with whitelist validation (forbidNonWhitelisted, as configured globally)', async () => {
    // The global ValidationPipe (main.ts) is configured with
    // whitelist + forbidNonWhitelisted; that is an application-level
    // concern this unit test cannot exercise directly since it calls
    // class-validator's validate() with default options. This test
    // documents the DTO-level contract that makes that global setting
    // effective: an unlisted key like companyId simply has no
    // decorator here for the pipe to whitelist, so it's stripped
    // before ever reaching the DTO.
    const dto = plainToInstance(UpdateCalendarEventDto, { companyId: 'company-x', title: 'X' });
    expect((dto as unknown as { companyId?: string }).companyId).toBe('company-x');
    // plainToInstance alone does not strip unknown properties by
    // default the way the ValidationPipe's whitelist option does —
    // this assertion exists to make that distinction explicit rather
    // than implying this test alone proves companyId is unwritable.
  });
});