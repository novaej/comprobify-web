'use server';

// Phase 3 will implement these properly using requireContext() + the new API client.

export type SettingsResult = { error: string } | { verified: true } | null;

export async function setupIssuerAction(_formData: FormData): Promise<SettingsResult> {
  throw new Error('NOT_IMPLEMENTED: setupIssuerAction — wire up in Phase 3 (onboarding flow)');
}

export async function promoteToProductionAction(
  _initialSequentials: { documentType: string; sequential: number }[] = [],
): Promise<SettingsResult> {
  throw new Error('NOT_IMPLEMENTED: promoteToProductionAction — wire up in Phase 6 (promotion flow)');
}

export async function resendVerificationAction(): Promise<SettingsResult> {
  throw new Error('NOT_IMPLEMENTED: resendVerificationAction — wire up in Phase 2');
}
