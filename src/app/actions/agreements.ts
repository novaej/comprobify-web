'use server';

import { headers } from 'next/headers';
import { requireContext } from '@/lib/context';
import { getAgreementStatus, acceptAgreements } from '@/lib/api';
import { listAgreements } from '@/lib/public-api';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';

export type AgreementStatusResult = Awaited<ReturnType<typeof getAgreementStatus>>;

export async function getAgreementStatusAction(): Promise<AgreementStatusResult | { error: string }> {
  try {
    const ctx = await requireContext({ skipIssuer: true });
    return await getAgreementStatus(ctx);
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}

// Accepts all PENDING agreement instances for the current tenant.
// Fetches the current TERMS version internally so the client doesn't need to track it.
export async function acceptAgreementsAction(): Promise<{ error: string } | null> {
  try {
    const ctx = await requireContext({ skipIssuer: true });

    // Get the current TERMS version — required by POST /v1/tenants/agreements for audit trail.
    // listAgreements() is public; if nothing is published yet, validateTermsVersion is a no-op
    // on the API side but we still need a non-empty string for the validator.
    // Forward the browser's User-Agent so the API stores the real client identity
    // rather than Node's fetch default. In the BFF pattern the actual HTTP request
    // to the Comprobify API originates from our server, so without this the API
    // would record the server's UA string ("node") instead of the browser's.
    const reqHeaders = await headers();
    const userAgent = reqHeaders.get('user-agent') ?? undefined;

    const published = await listAgreements();
    const termsDoc = published.find((d) => d.documentType === 'TERMS');
    const termsVersion = termsDoc?.version ?? 'pre-launch';

    await acceptAgreements(ctx, termsVersion, { userAgent });
    revalidatePath('/', 'layout');
    return null;
  } catch (err) {
    if (err instanceof ApiError) return { error: err.code };
    throw err;
  }
}
