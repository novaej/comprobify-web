import 'server-only';

// Phase 2 will replace these stubs with requireContext() from src/lib/context.ts.
// Keeping the old function names here avoids cascading type errors in reverted callers.

export async function requireApiKey(): Promise<string> {
  throw new Error('NOT_IMPLEMENTED: requireApiKey — replaced by requireContext() in Phase 2');
}

export async function getIssuerId(): Promise<number | null> {
  throw new Error('NOT_IMPLEMENTED: getIssuerId — replaced by requireContext() in Phase 2');
}
