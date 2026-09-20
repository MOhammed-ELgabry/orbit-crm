export interface DefaultRoleDefinition {
  name: string;
  description: string;
  permissions: readonly { resource: string; action: string }[];
}

/**
 * The 4 default staff roles every company gets — MANAGER, SALES,
 * SUPPORT, EMPLOYEE — and the permission grant each starts with,
 * exactly as agreed in the Phase 2 spec (contact/activity) and the
 * Leads spec (lead). There is deliberately no OWNER entry here:
 * Owner-level privilege is carried entirely by User.isOwner (see
 * OwnerGuard), never by a Role row. See ensureDefaultRolesForCompany
 * (role/utils/ensure-default-roles.util.ts) for how this list is turned
 * into idempotent Role/RolePermission rows for a brand-new company —
 * that function's own upsert intentionally never touches an
 * already-existing role's permissions.
 *
 * User/Role/Company administration (the user/company/role permissions
 * below) is intentionally Owner-only in this phase — none of these 4
 * roles are granted user:create/read/update/delete, company:read/update,
 * or role:manage. Only the contact, lead, and activity permissions are
 * in active use by any of them; the others would currently have no
 * effect even if granted, since UserController/RoleController/
 * CompanyController mutations check OwnerGuard only, not
 * PermissionsGuard — granting them here would be misleading dead
 * configuration, not a functional capability, so they're left out.
 */
export const DEFAULT_ROLE_DEFINITIONS: readonly DefaultRoleDefinition[] = [
  {
    name: 'MANAGER',
    description:
      'Full operational access to contacts, leads, and activities for ' +
      'the company. The highest normal staff role — still cannot ' +
      'manage users, roles, company settings, or become Owner.',
    permissions: [
      { resource: 'contact', action: 'create' },
      { resource: 'contact', action: 'read' },
      { resource: 'contact', action: 'update' },
      { resource: 'contact', action: 'delete' },
      { resource: 'lead', action: 'create' },
      { resource: 'lead', action: 'read' },
      { resource: 'lead', action: 'update' },
      { resource: 'lead', action: 'delete' },
      { resource: 'activity', action: 'create' },
      { resource: 'activity', action: 'read' },
      { resource: 'activity', action: 'update' },
      { resource: 'activity', action: 'delete' },
    ],
  },
  {
    name: 'SALES',
    description:
      'Sales-focused access: can create and work contacts, leads, and ' +
      'activities, but cannot delete them.',
    permissions: [
      { resource: 'contact', action: 'create' },
      { resource: 'contact', action: 'read' },
      { resource: 'contact', action: 'update' },
      { resource: 'lead', action: 'create' },
      { resource: 'lead', action: 'read' },
      { resource: 'lead', action: 'update' },
      { resource: 'activity', action: 'create' },
      { resource: 'activity', action: 'read' },
      { resource: 'activity', action: 'update' },
    ],
  },
  {
    name: 'SUPPORT',
    description:
      'Support-focused access: can create and work contacts, leads, ' +
      'and activities, but cannot delete them.',
    permissions: [
      { resource: 'contact', action: 'create' },
      { resource: 'contact', action: 'read' },
      { resource: 'contact', action: 'update' },
      { resource: 'lead', action: 'create' },
      { resource: 'lead', action: 'read' },
      { resource: 'lead', action: 'update' },
      { resource: 'activity', action: 'create' },
      { resource: 'activity', action: 'read' },
      { resource: 'activity', action: 'update' },
    ],
  },
  {
    name: 'EMPLOYEE',
    description:
      'Least-privilege standard staff role: read-only access to ' +
      'contacts, leads, and activities.',
    permissions: [
      { resource: 'contact', action: 'read' },
      { resource: 'lead', action: 'read' },
      { resource: 'activity', action: 'read' },
    ],
  },
];
