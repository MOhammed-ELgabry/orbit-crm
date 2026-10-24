/* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest mock call records are untyped (`any`) by design */
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';

import { AuditLogController } from './audit-log.controller';
import { AuditOwnerGuard } from './audit-owner.guard';
import { createVerifiedAuditScope } from './audit-scope';

describe('AuditLogController (route metadata + wiring)', () => {
  const proto = AuditLogController.prototype as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  const handlers = Object.getOwnPropertyNames(proto).filter(
    (name) => name !== 'constructor',
  );

  it('is mounted at /audit-logs', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AuditLogController)).toBe(
      'audit-logs',
    );
  });

  it('applies the three guards in the required order: Jwt → Owner → AuditOwner', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuditLogController,
    ) as unknown[];

    expect(guards).toEqual([JwtAuthGuard, OwnerGuard, AuditOwnerGuard]);
  });

  it('exposes ONLY read routes: every handler is a GET (no create / update / delete / export)', () => {
    expect(handlers.length).toBeGreaterThan(0);

    for (const name of handlers) {
      expect({
        name,
        method: Reflect.getMetadata(METHOD_METADATA, proto[name]),
      }).toEqual({ name, method: RequestMethod.GET });
    }
  });

  it('declares /actors before /:id so "actors" is never read as an id', () => {
    const paths = handlers.map(
      (name) => Reflect.getMetadata(PATH_METADATA, proto[name]) as string,
    );

    expect(paths.indexOf('actors')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('actors')).toBeLessThan(paths.indexOf(':id'));
  });

  it('marks every response Cache-Control: no-store', () => {
    for (const name of handlers) {
      const headers = Reflect.getMetadata('__headers__', proto[name]) as {
        name: string;
        value: string;
      }[];

      expect(headers).toEqual(
        expect.arrayContaining([{ name: 'Cache-Control', value: 'no-store' }]),
      );
    }
  });

  it('passes the verified scope (never a request value) to the query service', async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      listActors: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue({}),
    };
    const controller = new AuditLogController(service as never);
    const scope = createVerifiedAuditScope('user-1', 'company-A');

    await controller.list(scope, { page: 1 } as never);
    await controller.listActors(scope);
    await controller.getOne(scope, { id: 'row-1' });

    expect(service.list).toHaveBeenCalledWith(scope, { page: 1 });
    expect(service.listActors).toHaveBeenCalledWith(scope);
    expect(service.getById).toHaveBeenCalledWith(scope, 'row-1');
  });
});
