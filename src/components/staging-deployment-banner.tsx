import { getTranslations } from 'next-intl/server';
import { FlaskConical } from 'lucide-react';

// Deployment-level warning, independent of SandboxBanner's tenant-level one:
// COMPROBIFY_API_URL on app-staging.comprobify.com always points at the
// staging Comprobify API, which always submits to SRI's test/certification
// endpoint regardless of the tenant's own `environment` column. A tenant that
// has promoted itself to "production" here would otherwise see no banner at
// all, which could read as "these are real, SRI-authorized documents" when
// they are not. Gated purely on NEXT_PUBLIC_APP_ENV, so it shows for every
// tenant on staging no matter their own sandbox/production state — unlike
// SandboxBanner, this one isn't about the tenant, it's about the deployment.
export async function StagingDeploymentBanner() {
  if (process.env.NEXT_PUBLIC_APP_ENV !== 'staging') return null;

  const t = await getTranslations('stagingDeployment');

  return (
    <div
      role="alert"
      className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
    >
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
      {t('banner')}
    </div>
  );
}
