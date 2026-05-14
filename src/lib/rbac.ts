export type Role = 'Owner' | 'Admin' | 'BillingOperator' | 'Viewer' | 'Developer';

export type Permission =
  | 'documents.create'
  | 'documents.read'
  | 'documents.manage'
  | 'clients.manage'
  | 'catalog.manage'
  | 'issuers.read'
  | 'issuers.manage'
  | 'tenant.promote'
  | 'apikeys.read'
  | 'apikeys.manage'
  | 'users.read'
  | 'users.manage'
  | 'billing.read'
  | 'tenant.manage';

const ALL: ReadonlySet<Permission> = new Set([
  'documents.create', 'documents.read', 'documents.manage',
  'clients.manage', 'catalog.manage',
  'issuers.read', 'issuers.manage',
  'tenant.promote',
  'apikeys.read', 'apikeys.manage',
  'users.read', 'users.manage',
  'billing.read',
  'tenant.manage',
]);

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  Owner: ALL,
  Admin: new Set([
    'documents.create', 'documents.read', 'documents.manage',
    'clients.manage', 'catalog.manage',
    'issuers.read', 'issuers.manage',
    'apikeys.read', 'apikeys.manage',
    'users.read', 'users.manage',
    'billing.read',
  ]),
  BillingOperator: new Set([
    'documents.create', 'documents.read', 'documents.manage',
    'clients.manage', 'catalog.manage',
    'issuers.read',
  ]),
  Viewer: new Set([
    'documents.read',
    'issuers.read',
  ]),
  Developer: new Set([
    'documents.read',
    'apikeys.read', 'apikeys.manage',
    'issuers.read',
  ]),
};

export function hasPermission(role: Role, code: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(code);
}
