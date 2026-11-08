import 'reflect-metadata';

import { PERMISSIONS_METADATA_KEY } from '../../common/security/permissions.decorator';
import { PermissionsGuard } from '../../common/security/permissions.guard';
import { CsrfGuard } from '../../common/security/csrf.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { LeadConversionController } from './lead-conversion.controller';

/**
 * Authorization METADATA only (which guards / permissions are declared).
 * Real allow/deny behaviour needs the test database
 * (test/integration/lead-conversion).
 */
const handlerOf = (name: string): object =>
  Object.getOwnPropertyDescriptor(LeadConversionController.prototype, name)
    ?.value as object;

const required = (name: string) =>
  Reflect.getMetadata(PERMISSIONS_METADATA_KEY, handlerOf(name)) as Array<{
    resource: string;
    action: string;
  }>;

const guards = (target: object) =>
  (Reflect.getMetadata('__guards__', target) ?? []) as unknown[];

const sorted = (list: Array<{ resource: string; action: string }>) =>
  list.map((p) => `${p.resource}:${p.action}`).sort();

describe('LeadConversionController authorization metadata', () => {
  it('requires authentication for the whole controller', () => {
    expect(guards(LeadConversionController)).toContain(JwtAuthGuard);
  });

  it('convert requires exactly deal:update + lead:update + contact:create, with CSRF', () => {
    expect(guards(handlerOf('convert'))).toEqual([PermissionsGuard, CsrfGuard]);
    expect(sorted(required('convert'))).toEqual([
      'contact:create',
      'deal:update',
      'lead:update',
    ]);
  });

  it('preview is read-only: no CSRF, read permissions only', () => {
    expect(guards(handlerOf('preview'))).toEqual([PermissionsGuard]);
    expect(sorted(required('preview'))).toEqual([
      'contact:read',
      'deal:read',
      'lead:read',
    ]);
  });

  it('exposes exactly preview (GET) and convert (POST)', () => {
    const names = Object.getOwnPropertyNames(
      LeadConversionController.prototype,
    ).filter((n) => n !== 'constructor');

    expect(names.sort()).toEqual(['convert', 'preview']);
    // RequestMethod.GET === 0, POST === 1
    expect(Reflect.getMetadata('method', handlerOf('preview'))).toBe(0);
    expect(Reflect.getMetadata('method', handlerOf('convert'))).toBe(1);
  });
});
