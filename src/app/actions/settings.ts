'use server';

// Re-exports for components that still import resendVerificationAction from here.
// promoteTenantAction lives in tenant.ts.
export { resendVerificationAction } from '@/app/actions/tenant';
export type { VerificationResult as SettingsResult } from '@/app/actions/tenant';
