/**
 * Known "from" origins for pages reachable from multiple parent screens
 * (e.g. /invoices/new and /invoices/[key] from both Panel and Comprobantes).
 * Pages pass `?from=<key>` and read it back here to point the back link
 * at the screen the user actually came from instead of a hardcoded parent.
 */
export const BACK_TARGETS = {
  dashboard: { href: '/dashboard', namespace: 'dashboard', key: 'title' },
  documents: { href: '/documents', namespace: 'documents', key: 'title' },
  'documents-01': { href: '/documents/01', namespace: 'documents', key: 'types.01.name' },
  'documents-04': { href: '/documents/04', namespace: 'documents', key: 'types.04.name' },
} as const;

export type BackTargetKey = keyof typeof BACK_TARGETS;

export function isBackTargetKey(value: string | undefined): value is BackTargetKey {
  return value !== undefined && value in BACK_TARGETS;
}
