import 'reflect-metadata';

import { PERMISSIONS_METADATA_KEY } from '../../common/security/permissions.decorator';
import { PermissionsGuard } from '../../common/security/permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { ReportController } from './report.controller';

const handlerOf = (name: string): object =>
  Object.getOwnPropertyDescriptor(ReportController.prototype, name)
    ?.value as object;

const required = (name: string) =>
  Reflect.getMetadata(PERMISSIONS_METADATA_KEY, handlerOf(name)) as Array<{
    resource: string;
    action: string;
  }>;

const guards = (target: object) =>
  (Reflect.getMetadata('__guards__', target) ?? []) as unknown[];

describe('ReportController authorization metadata', () => {
  it('requires authentication for the whole controller', () => {
    expect(guards(ReportController)).toContain(JwtAuthGuard);
  });

  it.each([
    ['pipelineSnapshot', [{ resource: 'deal', action: 'read' }]],
    [
      'leadsOverview',
      [
        { resource: 'lead', action: 'read' },
        { resource: 'deal', action: 'read' },
      ],
    ],
    ['tasksOverview', [{ resource: 'task', action: 'read' }]],
  ] as const)(
    '%s is gated by PermissionsGuard with exactly the documented read permissions',
    (name, expected) => {
      expect(guards(handlerOf(name))).toContain(PermissionsGuard);
      expect(required(name)).toEqual(expected);
    },
  );

  it('exposes only GET endpoints (reports never change state)', () => {
    const names = Object.getOwnPropertyNames(ReportController.prototype).filter(
      (name) => name !== 'constructor',
    );

    // RequestMethod.GET === 0
    expect(
      names.map((n) => Reflect.getMetadata('method', handlerOf(n)) as number),
    ).toEqual([0, 0, 0]);
  });
});
