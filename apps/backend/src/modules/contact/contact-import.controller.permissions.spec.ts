import 'reflect-metadata';

import { PERMISSIONS_METADATA_KEY } from '../../common/security/permissions.decorator';
import { PermissionsGuard } from '../../common/security/permissions.guard';
import { CsrfGuard } from '../../common/security/csrf.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { ContactImportController } from './contact-import.controller';

/**
 * Authorization METADATA of the import endpoints. This only proves which
 * guards/permission are declared; the real allow/deny behaviour (Owner, role
 * with/without contact:create, role-less, anonymous, CSRF) is covered by
 * test/integration/contacts/contacts-import.int-spec.ts, which needs the test
 * database.
 */
const handlerOf = (name: string): object =>
  Object.getOwnPropertyDescriptor(ContactImportController.prototype, name)
    ?.value as object;

const required = (name: string) =>
  Reflect.getMetadata(PERMISSIONS_METADATA_KEY, handlerOf(name)) as Array<{
    resource: string;
    action: string;
  }>;

const guards = (target: object) =>
  (Reflect.getMetadata('__guards__', target) ?? []) as unknown[];

describe('ContactImportController authorization metadata', () => {
  it('requires authentication for the whole controller', () => {
    expect(guards(ContactImportController)).toContain(JwtAuthGuard);
  });

  it.each(['validate', 'import'])(
    '%s uses PermissionsGuard + CsrfGuard (in that order) and only contact:create',
    (name) => {
      expect(guards(handlerOf(name))).toEqual([PermissionsGuard, CsrfGuard]);
      expect(required(name)).toEqual([
        { resource: 'contact', action: 'create' },
      ]);
    },
  );

  it('exposes only the two POST endpoints', () => {
    const names = Object.getOwnPropertyNames(
      ContactImportController.prototype,
    ).filter((name) => name !== 'constructor');

    expect(names.sort()).toEqual(['import', 'validate']);
    // RequestMethod.POST === 1
    expect(
      names.map((n) => Reflect.getMetadata('method', handlerOf(n)) as number),
    ).toEqual([1, 1]);
  });
});
