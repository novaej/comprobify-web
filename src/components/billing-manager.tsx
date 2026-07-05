'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileIcon, DownloadIcon, Trash2Icon, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  submitPaymentProofAction,
  listPaymentProofsAction,
  deletePaymentProofAction,
  changeTierAction,
  createSubscriptionAction,
  cancelSubscriptionAction,
} from '@/app/actions/billing';
import type { ApiTenantInfo, ApiSubscriptionInfo, ApiPaymentInfo, ApiBankTransferInfo, ApiPaymentProof } from '@/lib/api';
import type { ApiTierInfo } from '@/lib/public-api';
import type { PaidTier, BillingInterval } from '@/lib/subscription-tiers';

const currencyFormatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' });
const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'long' });

const SUBSCRIPTION_STATUS_STYLES: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  PAYMENT_RECEIVED: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  INVOICE_PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  ACTIVE: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  EXPIRED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  SUSPENDED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  CANCELLED: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30',
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30',
  REPORTED: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  VERIFIED: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  REJECTED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  REFUNDED: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30',
};

export function BillingManager({
  tenantInfo,
  currentTier,
  tiers,
  subscriptions,
  pendingBankTransfer,
  proofsByPaymentId,
  canManageBilling,
  isSandbox,
  emailVerified,
  intendedTier,
  intendedBillingInterval,
}: {
  tenantInfo: ApiTenantInfo;
  currentTier: ApiTierInfo | null;
  tiers: ApiTierInfo[];
  subscriptions: ApiSubscriptionInfo[];
  pendingBankTransfer: ApiBankTransferInfo | null;
  proofsByPaymentId: Record<string, ApiPaymentProof[]>;
  canManageBilling: boolean;
  isSandbox: boolean;
  emailVerified: boolean;
  intendedTier?: PaidTier;
  intendedBillingInterval?: BillingInterval;
}) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tIssuers = useTranslations('issuers');
  const [viewingHistoryProof, setViewingHistoryProof] = useState<{ paymentId: number; proof: ApiPaymentProof } | null>(null);

  const tierKey = `tiers.${tenantInfo.subscriptionTier}.name` as Parameters<typeof tPricing>[0];
  const tierName = tPricing.has(tierKey) ? tPricing(tierKey) : tenantInfo.subscriptionTier;

  const latestSubscription = subscriptions[0] ?? null;
  const latestPayment = latestSubscription?.payments[0] ?? null;
  const isSubscriptionOver = latestSubscription?.status === 'CANCELLED' || latestSubscription?.status === 'EXPIRED';
  const needsAction = !!latestPayment && latestPayment.status !== 'VERIFIED' && !isSubscriptionOver;
  // pending_tier = 'FREE' means cancellation scheduled; a paid tier means downgrade scheduled.
  const pendingCancellation = latestSubscription?.status === 'ACTIVE' && latestSubscription.pending_tier === 'FREE';
  const pendingDowngradeTier = latestSubscription?.status === 'ACTIVE' && latestSubscription.pending_tier !== 'FREE'
    ? latestSubscription.pending_tier
    : null;
  const anyPendingTierChange = pendingCancellation || !!pendingDowngradeTier;
  const canChangeTier =
    canManageBilling &&
    latestSubscription?.status === 'ACTIVE' &&
    !needsAction &&
    !anyPendingTierChange;
  // POST /v1/subscriptions blocks a new subscription while any prior one isn't
  // CANCELLED/EXPIRED — mirror that here rather than just "no subscriptions yet".
  const canSubscribeNew = canManageBilling && subscriptions.every((s) => s.status === 'CANCELLED' || s.status === 'EXPIRED');

  return (
    <div className="space-y-4">
      <ProofPreviewDialog
        proof={viewingHistoryProof?.proof ?? null}
        paymentId={viewingHistoryProof?.paymentId ?? 0}
        onClose={() => setViewingHistoryProof(null)}
      />
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold">{t('currentPlan')}</h2>
        <p className="mt-1.5 text-lg font-semibold">{tierName}</p>
        {!isSandbox && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('usage', { count: Number(tenantInfo.documentCount), quota: tenantInfo.documentQuota })}
          </p>
        )}
        {currentTier && currentTier.priceMonthlyUsd > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {currencyFormatter.format(currentTier.priceMonthlyUsd)}
            {tPricing('perMonth')}
            {' · '}
            <span className="text-xs">{t('ivaIncluded')}</span>
          </p>
        )}
        {!isSandbox && latestSubscription?.status === 'ACTIVE' && latestSubscription.current_period_start && latestSubscription.current_period_end && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('billingPeriod', {
              start: dateFormatter.format(new Date(latestSubscription.current_period_start)),
              end: dateFormatter.format(new Date(latestSubscription.current_period_end)),
            })}
          </p>
        )}
        {pendingDowngradeTier && latestSubscription?.current_period_end && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            {t('downgradeScheduled', {
              tier: tPricing.has(`tiers.${pendingDowngradeTier}.name` as Parameters<typeof tPricing>[0])
                ? tPricing(`tiers.${pendingDowngradeTier}.name` as Parameters<typeof tPricing>[0])
                : pendingDowngradeTier,
              date: dateFormatter.format(new Date(latestSubscription.current_period_end)),
            })}
          </p>
        )}
        {pendingCancellation && latestSubscription?.current_period_end && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            {t('cancellationScheduled', {
              date: dateFormatter.format(new Date(latestSubscription.current_period_end)),
            })}
          </p>
        )}

        {currentTier && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('planDetails')}
            </p>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { label: t('planLimits.quota'), value: String(currentTier.documentQuota) },
                {
                  label: t('planLimits.branches'),
                  value: currentTier.maxBranches === null ? t('planLimits.unlimited') : String(currentTier.maxBranches),
                },
                {
                  label: t('planLimits.issuePoints'),
                  value: currentTier.maxIssuePointsPerBranch === null ? t('planLimits.unlimited') : String(currentTier.maxIssuePointsPerBranch),
                },
                { label: t('planLimits.webhooks'), value: String(currentTier.maxWebhookEndpoints) },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-xs font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2">
              <p className="mb-1.5 text-xs text-muted-foreground">{t('planLimits.allowedDocTypes')}</p>
              <div className="flex flex-wrap gap-1.5">
                {currentTier.allowedDocumentTypes.map((code) => (
                  <span
                    key={code}
                    className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {tIssuers.has(`docType.${code}` as Parameters<typeof tIssuers>[0])
                      ? tIssuers(`docType.${code}` as Parameters<typeof tIssuers>[0])
                      : code}
                    {' '}({code})
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {needsAction && latestPayment && (
        <PendingPaymentCard
          payment={latestPayment}
          bankTransfer={pendingBankTransfer}
          initialProofs={proofsByPaymentId[String(latestPayment.id)] ?? []}
          canManageBilling={canManageBilling}
        />
      )}

      {canSubscribeNew && (
        <SubscribeCard
          tiers={tiers}
          emailVerified={emailVerified}
          intendedTier={intendedTier}
          intendedBillingInterval={intendedBillingInterval}
        />
      )}

      {canChangeTier && latestSubscription && (
        <ChangeTierCard
          tiers={tiers}
          currentSubscriptionTier={latestSubscription.tier}
          currentBillingInterval={latestSubscription.billing_interval}
          currentPeriodEnd={latestSubscription.current_period_end}
          isSandbox={isSandbox}
        />
      )}

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">{t('history')}</h2>
        {(() => {
          // Flatten all payments across subscriptions, oldest subscription last so newest
          // payments (from the most recent subscription) appear at the top.
          const rows = subscriptions.flatMap((sub) =>
            sub.payments.map((p) => ({ payment: p, sub }))
          );
          if (rows.length === 0) {
            return <p className="text-sm text-muted-foreground">{t('noHistory')}</p>;
          }
          return (
            <div className="divide-y divide-border">
              {rows.map(({ payment: p, sub }) => {
                const paymentStatusKey = `paymentStatus.${p.status}` as Parameters<typeof t>[0];
                const subTierKey = `tiers.${sub.tier}.name` as Parameters<typeof tPricing>[0];
                const subTierName = tPricing.has(subTierKey) ? tPricing(subTierKey) : sub.tier;
                const targetTierKey = p.target_tier
                  ? (`tiers.${p.target_tier}.name` as Parameters<typeof tPricing>[0])
                  : null;

                let purposeLabel: string;
                if (p.purpose === 'TIER_CHANGE' && targetTierKey) {
                  const targetTierName = tPricing.has(targetTierKey) ? tPricing(targetTierKey) : p.target_tier ?? '';
                  if (p.target_billing_interval) {
                    purposeLabel = t('tierChangeToWithInterval', {
                      tier: targetTierName,
                      interval: tPricing(`interval.${p.target_billing_interval.toLowerCase()}` as Parameters<typeof tPricing>[0]),
                    });
                  } else {
                    purposeLabel = t('tierChangeTo', { tier: targetTierName });
                  }
                } else if (p.purpose === 'RENEWAL') {
                  purposeLabel = t('paymentPurposeRenewal', { tier: subTierName });
                } else {
                  purposeLabel = t('paymentPurposeInitial', { tier: subTierName });
                }

                const historyProofs = proofsByPaymentId[String(p.id)] ?? [];
                return (
                  <div key={p.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {currencyFormatter.format(Number(p.total_amount ?? p.amount))}
                          {p.total_amount && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t('ivaIncluded')}</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{purposeLabel}</p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${PAYMENT_STATUS_STYLES[p.status] ?? ''}`}>
                        {t.has(paymentStatusKey) ? t(paymentStatusKey) : p.status}
                      </Badge>
                    </div>
                    {historyProofs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {historyProofs.map((proof) => (
                          <button
                            key={proof.id}
                            type="button"
                            onClick={() => setViewingHistoryProof({ paymentId: p.id, proof })}
                            className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <FileIcon className="h-3 w-3 shrink-0" />
                            {proof.filename}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function PendingPaymentCard({
  payment,
  bankTransfer,
  initialProofs,
  canManageBilling,
}: {
  payment: ApiPaymentInfo;
  bankTransfer: ApiBankTransferInfo | null;
  initialProofs: ApiPaymentProof[];
  canManageBilling: boolean;
}) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hasFiles, setHasFiles] = useState(false);
  const [proofs, setProofs] = useState<ApiPaymentProof[]>(initialProofs);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTierChange = payment.purpose === 'TIER_CHANGE';
  const targetTierKey = payment.target_tier
    ? (`tiers.${payment.target_tier}.name` as Parameters<typeof tPricing>[0])
    : null;
  const targetTierName =
    targetTierKey && tPricing.has(targetTierKey) ? tPricing(targetTierKey) : payment.target_tier ?? '';

  function handleUpload() {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append('proof', file);
    startTransition(async () => {
      const result = await submitPaymentProofAction(payment.id, formData);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('pendingPayment.uploaded'));
        setHasFiles(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        // Refresh full proof list after upload (result.proofs only has the new ones)
        const refreshed = await listPaymentProofsAction(payment.id);
        if (!('error' in refreshed)) setProofs(refreshed.proofs);
      }
    });
  }

  function handleDelete(proofId: string) {
    setDeletingId(proofId);
    startTransition(async () => {
      const result = await deletePaymentProofAction(payment.id, proofId);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        setProofs((prev) => prev.filter((p) => p.id !== proofId));
        toast.success(t('pendingPayment.proofDeleted'));
      }
      setDeletingId(null);
    });
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10">
      <h2 className="text-sm font-semibold">
        {isTierChange
          ? t('pendingPayment.tierChangeTitle', { tier: targetTierName })
          : payment.purpose === 'RENEWAL'
            ? t('pendingPayment.renewalTitle')
            : t('pendingPayment.title')}
      </h2>
      <p className="mt-2 text-2xl font-semibold tracking-tight">
        {currencyFormatter.format(Number(payment.total_amount ?? payment.amount))}
        {payment.total_amount && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">{t('ivaIncluded')}</span>
        )}
      </p>

      {payment.rejection_reason_code && (
        <p className="mt-2 text-sm text-destructive">
          {t('pendingPayment.rejected', {
            reason: t.has(`rejectionReason.${payment.rejection_reason_code}` as Parameters<typeof t>[0])
              ? t(`rejectionReason.${payment.rejection_reason_code}` as Parameters<typeof t>[0])
              : t('rejectionReason.OTHER'),
          })}
        </p>
      )}

      {bankTransfer ? (
        <div className="mt-3 space-y-1 rounded-md border border-border bg-background p-3 text-sm">
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.bank')}:</span> {bankTransfer.bankName}
          </p>
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.accountType')}:</span>{' '}
            {bankTransfer.accountType}
          </p>
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.accountNumber')}:</span>{' '}
            {bankTransfer.accountNumber}
          </p>
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.accountHolder')}:</span>{' '}
            {bankTransfer.accountHolder}
          </p>
          <p>
            <span className="text-muted-foreground">{t('pendingPayment.identification')}:</span>{' '}
            {bankTransfer.identification}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t('pendingPayment.contactSupport')}</p>
      )}

      {/* Uploaded proof files */}
      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">{t('pendingPayment.proofs')}</p>
        {proofs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pendingPayment.noProofs')}</p>
        ) : (
          <ul className="space-y-1.5">
            {proofs.map((proof) => (
              <li
                key={proof.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-xs">{proof.filename}</span>
                <a
                  href={`/api/payments/${payment.id}/proofs/${proof.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-primary hover:text-primary/80"
                  title={t('pendingPayment.download')}
                >
                  <DownloadIcon className="h-3.5 w-3.5" />
                </a>
                {canManageBilling && (
                  <button
                    type="button"
                    onClick={() => handleDelete(proof.id)}
                    disabled={isPending && deletingId === proof.id}
                    className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                    title={t('pendingPayment.deleteProof')}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManageBilling && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,application/pdf"
            multiple
            disabled={isPending}
            onChange={(e) => setHasFiles(!!e.target.files?.length)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
          />
          <Button size="sm" onClick={handleUpload} disabled={isPending || !hasFiles}>
            {isPending ? t('pendingPayment.uploading') : t('pendingPayment.upload')}
          </Button>
        </div>
      )}
    </div>
  );
}

function ProofPreviewDialog({
  proof,
  paymentId,
  onClose,
}: {
  proof: ApiPaymentProof | null;
  paymentId: string | number;
  onClose: () => void;
}) {
  const t = useTranslations('billing');
  if (!proof) return null;
  const src = `/api/payments/${paymentId}/proofs/${proof.id}?inline=1`;
  const downloadHref = `/api/payments/${paymentId}/proofs/${proof.id}`;
  const isImage = proof.mimeType.startsWith('image/');
  const isPdf = proof.mimeType === 'application/pdf';

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-6">
            <DialogTitle className="truncate">{proof.filename}</DialogTitle>
            <a
              href={downloadHref}
              download
              className="shrink-0 inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {t('pendingPayment.download')}
            </a>
          </div>
        </DialogHeader>
        <div className="overflow-auto rounded-md bg-muted/30">
          {isImage && (
            <img src={src} alt={proof.filename} className="max-w-full mx-auto" />
          )}
          {isPdf && (
            <iframe
              src={src}
              title={proof.filename}
              className="h-[60vh] w-full rounded-md border-0"
            />
          )}
          {!isImage && !isPdf && (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
              <FileIcon className="h-8 w-8" />
              <p>{proof.filename}</p>
              <a href={downloadHref} download className="text-primary hover:underline">
                {t('pendingPayment.download')}
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Shared interval pill toggle used by both subscribe and change-plan cards
function IntervalToggle({
  value,
  onChange,
  disabled,
}: {
  value: 'MONTHLY' | 'YEARLY';
  onChange: (v: 'MONTHLY' | 'YEARLY') => void;
  disabled?: boolean;
}) {
  const tPricing = useTranslations('pricing');
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
      {(['MONTHLY', 'YEARLY'] as const).map((interval) => (
        <button
          key={interval}
          type="button"
          onClick={() => onChange(interval)}
          disabled={disabled}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            value === interval ? 'bg-background shadow-sm' : 'text-muted-foreground',
          )}
        >
          {tPricing(`interval.${interval.toLowerCase()}` as Parameters<typeof tPricing>[0])}
          {interval === 'YEARLY' && (
            <Badge variant="secondary" className="text-[10px]">
              {tPricing('interval.yearlyDiscount')}
            </Badge>
          )}
        </button>
      ))}
    </div>
  );
}

// Compact plan card used by both subscribe and change-plan grids
function PlanCard({
  tier,
  interval,
  state,
  onClick,
}: {
  tier: ApiTierInfo;
  interval: 'MONTHLY' | 'YEARLY';
  state: 'current' | 'selected' | 'default';
  onClick?: () => void;
}) {
  const tPricing = useTranslations('pricing');
  const t = useTranslations('billing');
  const price = interval === 'YEARLY' ? tier.priceYearlyUsd : tier.priceMonthlyUsd;
  const perLabel = tPricing(interval === 'YEARLY' ? 'perYear' : 'perMonth');
  const isHighlighted = tier.name === 'GROWTH';

  return (
    <div
      role={state !== 'current' ? 'button' : undefined}
      tabIndex={state !== 'current' ? 0 : undefined}
      onClick={state !== 'current' ? onClick : undefined}
      onKeyDown={state !== 'current' ? (e) => e.key === 'Enter' && onClick?.() : undefined}
      className={cn(
        'rounded-lg border p-4 flex flex-col gap-3 transition-all',
        state === 'current' && 'border-muted bg-muted/30 opacity-60 cursor-default',
        state === 'selected' && 'border-primary ring-2 ring-primary/30 bg-primary/5 cursor-pointer',
        state === 'default' && 'border-border cursor-pointer hover:border-primary/50',
        isHighlighted && state === 'default' && 'border-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">
          {tPricing(`tiers.${tier.name}.name` as Parameters<typeof tPricing>[0])}
        </p>
        {state === 'current' && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t('changePlan.currentPlan')}
          </span>
        )}
        {isHighlighted && state !== 'current' && (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {tPricing('badge.popular')}
          </span>
        )}
      </div>
      <div>
        <p className="text-xl font-bold">
          {currencyFormatter.format(price)}
          <span className="text-sm font-normal text-muted-foreground">{perLabel}</span>
        </p>
        <p className="text-xs text-muted-foreground">{t('ivaIncluded')}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {tPricing('features.quota', { count: tier.documentQuota })}
      </p>
    </div>
  );
}

function ChangeTierCard({
  tiers,
  currentSubscriptionTier,
  currentBillingInterval,
  currentPeriodEnd,
  isSandbox,
}: {
  tiers: ApiTierInfo[];
  currentSubscriptionTier: PaidTier;
  currentBillingInterval: 'MONTHLY' | 'YEARLY';
  currentPeriodEnd: string | null;
  isSandbox: boolean;
}) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [cancelConfirming, setCancelConfirming] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PaidTier | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<'MONTHLY' | 'YEARLY'>(currentBillingInterval);

  const options = tiers.filter((tier): tier is ApiTierInfo & { name: PaidTier } => tier.name !== 'FREE');

  const periodEndFormatted = currentPeriodEnd
    ? dateFormatter.format(new Date(currentPeriodEnd))
    : null;

  const currentTierInfo = tiers.find((ti) => ti.name === currentSubscriptionTier);
  const targetTierInfo = selectedTier ? tiers.find((ti) => ti.name === selectedTier) : null;
  const intervalChanged = selectedInterval !== currentBillingInterval;
  const isTierUpgrade = !!targetTierInfo && !!currentTierInfo &&
    targetTierInfo.priceMonthlyUsd > currentTierInfo.priceMonthlyUsd;
  const isTierDowngrade = !!targetTierInfo && !!currentTierInfo &&
    targetTierInfo.priceMonthlyUsd < currentTierInfo.priceMonthlyUsd;
  const isNoOp = selectedTier === currentSubscriptionTier && !intervalChanged;

  type Scenario = 'upgrade' | 'downgrade' | 'interval-change';
  let scenario: Scenario | null = null;
  if (selectedTier && !isNoOp) {
    if (intervalChanged) scenario = 'interval-change';
    else if (isTierUpgrade) scenario = 'upgrade';
    else if (isTierDowngrade) scenario = 'downgrade';
  }

  function selectTier(name: PaidTier) {
    setSelectedTier(name);
    setConfirming(false);
  }

  function handleChange() {
    if (!selectedTier || isNoOp) return;
    startTransition(async () => {
      const result = await changeTierAction(
        selectedTier,
        intervalChanged ? selectedInterval : undefined,
      );
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      setConfirming(false);
      setSelectedTier(null);
      setSelectedInterval(currentBillingInterval);
      if (result.effectiveAt && !result.payment) {
        toast.success(t('changePlan.downgradeScheduled'));
      } else if (result.payment) {
        toast.success(t('changePlan.upgradeRequested'));
      } else {
        toast.success(t('changePlan.upgradeApplied'));
      }
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelSubscriptionAction();
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      setCancelConfirming(false);
      toast.success(t('cancelPlan.scheduled'));
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{t('changePlan.title')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('changePlan.hint')}</p>

        <div className="mt-4">
          <IntervalToggle
            value={selectedInterval}
            onChange={(v) => { setSelectedInterval(v); setConfirming(false); }}
            disabled={isPending}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map((tier) => {
            const isCurrent = tier.name === currentSubscriptionTier && selectedInterval === currentBillingInterval;
            const isSelected = selectedTier === tier.name && !isCurrent;
            return (
              <PlanCard
                key={tier.name}
                tier={tier}
                interval={selectedInterval}
                state={isCurrent ? 'current' : isSelected ? 'selected' : 'default'}
                onClick={() => selectTier(tier.name as PaidTier)}
              />
            );
          })}
        </div>

        {selectedTier && !isNoOp && !confirming && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={isPending}>
              {t('changePlan.button')}
            </Button>
          </div>
        )}

        {isNoOp && selectedTier && (
          <p className="mt-3 text-xs text-muted-foreground">{t('changePlan.noOp')}</p>
        )}

        {confirming && selectedTier && scenario && (
          <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm space-y-2">
            <p>
              {scenario === 'upgrade'
                ? t('changePlan.confirmHintUpgrade')
                : scenario === 'downgrade'
                  ? (periodEndFormatted
                      ? t('changePlan.confirmHintDowngrade', { date: periodEndFormatted })
                      : t('changePlan.confirmHintDowngradeNoDate'))
                  : (periodEndFormatted
                      ? t('changePlan.confirmHintIntervalChange', { date: periodEndFormatted })
                      : t('changePlan.confirmHintIntervalChangeNoDate'))}
            </p>
            {targetTierInfo && scenario !== 'upgrade' && (
              <p className="font-medium">
                {currencyFormatter.format(selectedInterval === 'YEARLY' ? targetTierInfo.priceYearlyUsd : targetTierInfo.priceMonthlyUsd)}
                {tPricing(selectedInterval === 'YEARLY' ? 'perYear' : 'perMonth')}
                {' · '}
                <span className="text-xs font-normal text-muted-foreground">{t('ivaIncluded')}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleChange} disabled={isPending}>
                {isPending ? t('changePlan.confirming') : t('changePlan.confirm')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
                {t('changePlan.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {!isSandbox && (
        <div className="border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {periodEndFormatted
              ? t('cancelPlan.hint', { date: periodEndFormatted })
              : t('cancelPlan.hintNoDate')}
          </p>

          {!cancelConfirming && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/5"
              onClick={() => setCancelConfirming(true)}
              disabled={isPending}
            >
              {t('cancelPlan.button')}
            </Button>
          )}

          {cancelConfirming && (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-2">
              <p>
                {periodEndFormatted
                  ? t('cancelPlan.confirmHint', { date: periodEndFormatted })
                  : t('cancelPlan.confirmHintNoDate')}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleCancel} disabled={isPending}>
                  {isPending ? t('cancelPlan.confirming') : t('cancelPlan.confirm')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCancelConfirming(false)} disabled={isPending}>
                  {t('cancelPlan.keep')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubscribeCard({
  tiers,
  emailVerified,
  intendedTier,
  intendedBillingInterval,
}: {
  tiers: ApiTierInfo[];
  emailVerified: boolean;
  intendedTier?: PaidTier;
  intendedBillingInterval?: BillingInterval;
}) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PaidTier | null>(intendedTier ?? null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(intendedBillingInterval ?? 'MONTHLY');
  const options = tiers.filter((tier): tier is ApiTierInfo & { name: PaidTier } => tier.name !== 'FREE');

  function handleSubscribe() {
    if (!selectedTier) return;
    startTransition(async () => {
      const result = await createSubscriptionAction(selectedTier, billingInterval);
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      setConfirming(false);
      setSelectedTier(null);
      toast.success(t('subscribe.requested'));
    });
  }

  if (options.length === 0) return null;

  const selectedTierInfo = options.find((o) => o.name === selectedTier);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold">{t('subscribe.title')}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t('subscribe.hint')}</p>

      {intendedTier && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {t('subscribe.intendedHint', {
              tier: tPricing.has(`tiers.${intendedTier}.name` as Parameters<typeof tPricing>[0])
                ? tPricing(`tiers.${intendedTier}.name` as Parameters<typeof tPricing>[0])
                : intendedTier,
            })}
          </span>
        </div>
      )}

      {!emailVerified ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('subscribe.emailRequired')}</p>
      ) : (
        <>
          <div className="mt-4">
            <IntervalToggle
              value={billingInterval}
              onChange={(v) => { setBillingInterval(v); setConfirming(false); }}
              disabled={isPending}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {options.map((tier) => (
              <PlanCard
                key={tier.name}
                tier={tier}
                interval={billingInterval}
                state={selectedTier === tier.name ? 'selected' : 'default'}
                onClick={() => { setSelectedTier(tier.name as PaidTier); setConfirming(false); }}
              />
            ))}
          </div>

          {selectedTier && !confirming && (
            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={isPending}>
                {t('subscribe.button')}
              </Button>
            </div>
          )}

          {confirming && selectedTier && selectedTierInfo && (
            <div className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm space-y-2">
              <p className="font-medium">
                {currencyFormatter.format(
                  billingInterval === 'YEARLY' ? selectedTierInfo.priceYearlyUsd : selectedTierInfo.priceMonthlyUsd,
                )}
                {tPricing(billingInterval === 'YEARLY' ? 'perYear' : 'perMonth')}
                {' · '}
                <span className="text-xs font-normal text-muted-foreground">{t('ivaIncluded')}</span>
              </p>
              <p>{t('subscribe.confirmHint')}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSubscribe} disabled={isPending}>
                  {isPending ? t('subscribe.confirming') : t('subscribe.confirm')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
                  {t('subscribe.cancel')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
