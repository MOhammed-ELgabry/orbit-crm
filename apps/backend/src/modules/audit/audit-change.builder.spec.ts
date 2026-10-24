import { Prisma } from '@prisma/client';

import {
  buildCreateChanges,
  buildEntityLabel,
  buildUpdateChanges,
  capJson,
  normalizeAuditValue,
} from './audit-change.builder';

describe('audit change builder', () => {
  describe('buildCreateChanges', () => {
    it('records only operational fields that are set, never personal fields', () => {
      const changes = buildCreateChanges('contact', {
        id: 'c1',
        firstName: 'Mona',
        lastName: 'Ali',
        email: 'mona@example.com',
        phone: '+201000000000',
        notes: 'private note',
        status: 'active',
        source: null,
        assignedToId: 'u1',
      });

      expect(changes).toEqual({
        status: { old: null, new: 'active' },
        assignedToId: { old: null, new: 'u1' },
      });

      const serialized = JSON.stringify(changes);
      expect(serialized).not.toContain('mona@example.com');
      expect(serialized).not.toContain('+201000000000');
      expect(serialized).not.toContain('private note');
    });

    it('returns null when no operational field is set', () => {
      expect(buildCreateChanges('role', { id: 'r1', name: null })).toBeNull();
    });
  });

  describe('buildUpdateChanges', () => {
    it('records old/new for operational fields', () => {
      expect(
        buildUpdateChanges(
          'deal',
          { stage: 'new', amount: new Prisma.Decimal('10.50') },
          { stage: 'won', amount: new Prisma.Decimal('12.00') },
        ),
      ).toEqual({
        stage: { old: 'new', new: 'won' },
        amount: { old: '10.5', new: '12' },
      });
    });

    it('records ONLY the fact of change for personal / free-text fields', () => {
      const changes = buildUpdateChanges(
        'contact',
        {
          email: 'old@example.com',
          phone: '111',
          notes: 'a',
          status: 'active',
        },
        {
          email: 'new@example.com',
          phone: '111',
          notes: 'b',
          status: 'active',
        },
      );

      expect(changes).toEqual({
        email: { changed: true },
        notes: { changed: true },
      });

      const serialized = JSON.stringify(changes);
      expect(serialized).not.toContain('old@example.com');
      expect(serialized).not.toContain('new@example.com');
    });

    it('returns null when nothing allowlisted changed (no-op update)', () => {
      expect(
        buildUpdateChanges(
          'contact',
          { status: 'active', updatedAt: new Date(1) },
          { status: 'active', updatedAt: new Date(2) },
        ),
      ).toBeNull();
    });

    it('ignores fields that are not in the allowlist (secrets never leak)', () => {
      const changes = buildUpdateChanges(
        'user',
        { isActive: true, passwordHash: 'h1', refreshTokenHash: 't1' },
        { isActive: false, passwordHash: 'h2', refreshTokenHash: 't2' },
      );

      expect(changes).toEqual({ isActive: { old: true, new: false } });
      const serialized = JSON.stringify(changes);
      expect(serialized).not.toContain('h2');
      expect(serialized).not.toContain('t2');
    });

    it('detects a change in a long text even when the first 200 chars are equal', () => {
      const base = 'x'.repeat(300);

      expect(
        buildUpdateChanges(
          'contact',
          { notes: `${base}A` },
          { notes: `${base}B` },
        ),
      ).toEqual({ notes: { changed: true } });
    });

    it('serializes dates as ISO UTC and truncates long recorded values', () => {
      const changes = buildUpdateChanges(
        'task',
        { dueDate: null, status: 'a'.repeat(300) },
        { dueDate: new Date('2026-10-22T10:00:00.000Z'), status: 'b' },
      );

      expect(changes?.dueDate).toEqual({
        old: null,
        new: '2026-10-22T10:00:00.000Z',
      });
      expect((changes?.status as { old: string }).old).toHaveLength(201);
    });
  });

  describe('normalizeAuditValue', () => {
    it('drops exotic values', () => {
      expect(normalizeAuditValue({ a: 1 })).toBeUndefined();
      expect(normalizeAuditValue([1])).toBeUndefined();
      expect(normalizeAuditValue(undefined)).toBeNull();
    });
  });

  describe('buildEntityLabel', () => {
    it('builds the label from the allowlisted name/title', () => {
      expect(
        buildEntityLabel('contact', { firstName: ' Mona ', lastName: 'Ali' }),
      ).toBe('Mona Ali');
      expect(buildEntityLabel('deal', { title: 'Big deal' })).toBe('Big deal');
      expect(buildEntityLabel('role', { name: 'MANAGER' })).toBe('MANAGER');
    });

    it('returns null for an empty label and caps long labels', () => {
      expect(buildEntityLabel('deal', { title: '  ' })).toBeNull();
      expect(buildEntityLabel('deal', { title: 'z'.repeat(500) })).toHaveLength(
        120,
      );
    });
  });

  describe('capJson', () => {
    it('replaces an oversized value with a marker instead of truncating it', () => {
      expect(capJson({ a: 'x'.repeat(100) }, 10)).toEqual({ _truncated: true });
      expect(capJson({ a: 1 }, 1000)).toEqual({ a: 1 });
      expect(capJson(null, 10)).toBeNull();
    });
  });
});
