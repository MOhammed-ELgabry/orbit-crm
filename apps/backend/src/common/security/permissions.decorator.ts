import { SetMetadata } from '@nestjs/common';

import type {
  PermissionAction,
  PermissionResource,
} from '../../modules/permission/constants/permission.constants';

export const PERMISSIONS_METADATA_KEY = 'requiredPermissions';

export interface RequiredPermission {
  resource: PermissionResource;
  action: PermissionAction;
}

/**
 * Declares the permission(s) PermissionsGuard must find on the caller's
 * assigned Role for this route to proceed. Multiple arguments are ANDed
 * (all required), matching how NestJS's own SetMetadata-based decorators
 * (e.g. @Roles()) are conventionally combined.
 *
 * This only has any effect on a route that ALSO has PermissionsGuard in
 * its @UseGuards() chain — the decorator alone enforces nothing.
 */
export const RequirePermissions = (...permissions: RequiredPermission[]) =>
  SetMetadata(PERMISSIONS_METADATA_KEY, permissions);