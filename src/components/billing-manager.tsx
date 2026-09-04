'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileIcon, DownloadIcon, Trash2Icon, Info, Ban, CreditCard, Landmark, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PayphoneCheckout } from '@/components/payphone-checkout';
import { AccessKeyCopy } from '@/components/access-key-copy';
import {
  submitPaymentProofAction,
  listPaymentProofsAction,
  deletePaymentProofAction,
  cancelPaymentAction,
  changeTierAction,
  changeSeatsAction,
  createSubscriptionAction,
  cancelSubscriptionAction,
  createPayphoneSessionAction,
} from '@/app/actions/billing';
import type { ApiTenantInfo, ApiSubscriptionInfo, ApiPaymentInfo, ApiBankTransferInfo, ApiPaymentProof, ApiPayphoneSession } from '@/lib/api';
import type { ApiTierInfo, ApiExtraSeatPricing } from '@/lib/public-api';
import { TIER_RANK, resolveTierTotal, resolveSeatBasePrice, type PaidTier, type BillingInterval } from '@/lib/subscription-tiers';

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
  CANCELLED: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-300 dark:border-zinc-500/30',
};

// Payphone's own widget form expires 10 minutes after load — reusing a session
// held past that would fail at submit, so PendingPaymentCard mints a fresh one
// past this age instead of reusing the cached one.
const PAYPHONE_SESSION_MAX_AGE_MS = 10 * 60 * 1000;

// createPayphoneSession error codes that mean "card isn't a viable option for
// this payment right now" — PendingPaymentCard disables the "Tarjeta" tab
// rather than letting the tenant retry into the same wall. Distinct from any
// other/unexpected error code, which stays retryable inline.
const CARD_UNAVAILABLE_CODES = new Set([
  'PAYMENT_GATEWAY_NOT_CONFIGURED',
  'PAYPHONE_AMOUNT_BELOW_MINIMUM',
  'PAYPHONE_TOO_MANY_ATTEMPTS',
]);

export function BillingManager({
  tenantInfo,
  currentTier,
  tiers,
  extraSeat,
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
  extraSeat: ApiExtraSeatPricing | null;
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
  const [viewingHistoryProof, setViewingHistoryProof] = useState<{ paymentId: string; proof: ApiPaymentProof } | null>(null);

  const tierKey = `tiers.${tenantInfo.subscriptionTier}.name` as Parameters<typeof tPricing>[0];
  const tierName = tPricing.has(tierKey) ? tPricing(tierKey) : tenantInfo.subscriptionTier;

  const latestSubscription = subscriptions[0] ?? null;
  const latestPayment = latestSubscription?.payments[0] ?? null;
  const isSubscriptionOver = latestSubscription?.status === 'CANCELLED' || latestSubscription?.status === 'EXPIRED';
  // REFUNDED is terminal, not "still pending" — a refund already rolled the
  // subscription back to applied_from (see refundPayment on the API side), so
  // there's nothing left to pay for *this* payment. Without excluding it, the
  // pending-payment card kept demanding payment for an already-reversed
  // TIER_CHANGE instead of falling back to ChangeTierCard for a fresh attempt.
  // CANCELLED (migration 098) is the same story from the opposite direction —
  // the tenant backed out of the payment themselves before transferring
  // anything, so there's nothing to collect and nothing to review; without
  // excluding it, cancelling a TIER_CHANGE/SEAT_CHANGE payment (whose
  // subscription stays ACTIVE throughout, unlike an INITIAL cancellation
  // which cancels the subscription too and is already caught by
  // isSubscriptionOver) would keep PendingPaymentCard stuck showing the
  // cancelled payment instead of freeing ChangeTierCard/SeatsCard back up.
  // REJECTED stays included — that one genuinely needs a new proof upload.
  const needsAction = !!latestPayment
    && latestPayment.status !== 'VERIFIED'
    && latestPayment.status !== 'REFUNDED'
    && latestPayment.status !== 'CANCELLED'
    && !isSubscriptionOver;
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
        paymentId={viewingHistoryProof?.paymentId ?? ''}
        onClose={() => setViewingHistoryProof(null)}
      />
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold">{t('currentPlan')}</h2>
        <p className="mt-1.5 text-lg font-semibold">{tierName}</p>
        {!isSandbox && (
          <p className="mt-1 text-sm text-muted-foreground">
            {tenantInfo.documentQuota === null
              ? t('usageUnlimited', { count: Number(tenantInfo.documentCount) })
              : t('usage', { count: Number(tenantInfo.documentCount), quota: tenantInfo.documentQuota })}
          </p>
        )}
        {latestSubscription?.status === 'ACTIVE' && (
          <p className="mt-1 text-sm text-muted-foreground">
            {isSandbox
              ? t('billingPeriodSandbox', {
                  interval: t(`billingInterval.${latestSubscription.billing_interval}`),
                })
              : latestSubscription.current_period_start && latestSubscription.current_period_end
                ? t('billingPeriod', {
                    start: dateFormatter.format(new Date(latestSubscription.current_period_start)),
                    end: dateFormatter.format(new Date(latestSubscription.current_period_end)),
                    interval: t(`billingInterval.${latestSubscription.billing_interval}`),
                  })
                : null}
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

        {/* The top-of-page SuspendedBanner (local Tenant.status mirror) has no
            room for *why* — this reads the live suspensionReasonCode from the
            same getCurrentTenant() call this page already makes. VOLUNTARY_CLOSURE
            gets deliberately neutral copy, not punitive wording (ADR-027). */}
        {tenantInfo.status === 'SUSPENDED' && tenantInfo.suspensionReasonCode && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive dark:border-destructive/40 dark:bg-destructive/15">
            <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{t(`suspensionReasons.${tenantInfo.suspensionReasonCode}`)}</span>
          </div>
        )}

        {currentTier && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('planDetails')}
            </p>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                {
                  label: t('planLimits.quota'),
                  value: currentTier.documentQuota === null ? t('planLimits.unlimited') : String(currentTier.documentQuota),
                },
                {
                  label: t('planLimits.branches'),
                  value: currentTier.maxBranches === null ? t('planLimits.unlimited') : String(currentTier.maxBranches),
                },
                {
                  label: t('planLimits.issuePoints'),
                  value: currentTier.maxIssuePointsPerBranch === null ? t('planLimits.unlimited') : String(currentTier.maxIssuePointsPerBranch),
                },
                { label: t('planLimits.webhooks'), value: String(currentTier.maxWebhookEndpoints) },
                {
                  label: t('planLimits.users'),
                  value: currentTier.maxUsers === null
                    ? t('planLimits.unlimited')
                    : tenantInfo.extraSeats > 0
                      ? t('planLimits.usersWithExtra', { base: currentTier.maxUsers, extra: tenantInfo.extraSeats })
                      : String(currentTier.maxUsers),
                },
                {
                  label: t('planLimits.apiKeys'),
                  value: currentTier.maxApiKeys === null ? t('planLimits.unlimited') : String(currentTier.maxApiKeys),
                },
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
          currentSubscriptionTier={tenantInfo.subscriptionTier}
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

      {canChangeTier && latestSubscription && extraSeat && (
        <SeatsCard
          extraSeat={extraSeat}
          currentExtraSeats={latestSubscription.extra_seats}
          pendingExtraSeats={latestSubscription.pending_extra_seats ?? null}
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
              {rows.map(({ payment: p }) => {
                const paymentStatusKey = `paymentStatus.${p.status}` as Parameters<typeof t>[0];
                const targetTierKey = p.target_tier
                  ? (`tiers.${p.target_tier}.name` as Parameters<typeof tPricing>[0])
                  : null;

                // INITIAL/RENEWAL purpose labels used to interpolate the
                // subscription's *current* tier (sub.tier) — wrong for any
                // payment that predates a later tier change, since
                // subscriptions.tier is mutated in place and payments has no
                // column snapshotting what tier was active at INITIAL/RENEWAL
                // time (only target_tier, TIER_CHANGE-only). A tenant who paid
                // for Lite then changed to Starter would see their original
                // Lite payment mislabeled "Suscripción — Starter". Only
                // TIER_CHANGE has a reliable per-payment tier (target_tier),
                // so that's the only purpose that still names one.
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
                } else if (p.purpose === 'SEAT_CHANGE') {
                  purposeLabel = t('seatChangeLabel', { seats: p.seats_charged ?? p.target_extra_seats ?? 0 });
                } else if (p.purpose === 'RENEWAL') {
                  purposeLabel = t('paymentPurposeRenewal');
                } else {
                  purposeLabel = t('paymentPurposeInitial');
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
                        <p className="mt-0.5 text-xs text-muted-foreground">{dateFormatter.format(new Date(p.created_at))}</p>
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
                            className="inline-flex cursor-pointer items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
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
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proofs, setProofs] = useState<ApiPaymentProof[]>(initialProofs);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Self-cancel a still-PENDING payment (migration 098) — wrong tier/seat
  // count, tenant never transferred anything. Own transition, separate from
  // the proof upload/delete one above, so cancelling doesn't gray out
  // unrelated controls mid-flight. Only PENDING, non-RENEWAL payments
  // qualify — see cancelPaymentAction/cancelPayment in src/lib/api.ts.
  const [cancelConfirming, setCancelConfirming] = useState(false);
  const [cancelPending, startCancelTransition] = useTransition();
  const canCancelPayment = payment.status === 'PENDING' && payment.purpose !== 'RENEWAL';

  function handleCancelPayment() {
    startCancelTransition(async () => {
      const result = await cancelPaymentAction(payment.id);
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      setCancelConfirming(false);
      toast.success(t('pendingPayment.cancelled'));
    });
  }

  // Card payment (Payphone, ADR-028) alongside the existing bank-transfer flow —
  // both stay first-class, offered side by side. The session is only minted the
  // first time the tenant actually picks the "Tarjeta" tab, not eagerly on
  // mount, since createPayphoneSession also flips payments.method as a side
  // effect — doing that just from rendering the page would be misleading.
  //
  // One mint per checkout, not one per widget open: the API deliberately never
  // reuses an attempt server-side (it can't tell "closed without paying" from
  // "paid but the redirect never arrived," and reusing a clientTransactionId in
  // the second case would be a duplicate submission against a live charge — see
  // ADR-028 / PAYPHONE_TOO_MANY_ATTEMPTS below), so *this* component holding
  // onto the session for as long as it's valid is what keeps a naive re-open
  // from minting a fresh attempt every time. `payphoneSession` persisting
  // across a Transferencia/Tarjeta tab toggle already covers "modal reopened
  // within the window" (see handleSelectCard's guard); `sessionMintedAt` below
  // additionally covers "the tenant left this open past Payphone's own 10-
  // minute form expiry," where reusing the stale session would fail at submit.
  //
  // This is driven entirely by handleSelectCard, a click handler — never a
  // useEffect — specifically so React 18 Strict Mode's dev-only double-invoke
  // of effects can never double a mint. If minting logic is ever moved into an
  // effect, that guarantee no longer holds and needs re-checking.
  const [payMethod, setPayMethod] = useState<'transfer' | 'card'>('transfer');
  const [cardPending, startCardTransition] = useTransition();
  const [payphoneSession, setPayphoneSession] = useState<ApiPayphoneSession | null>(null);
  const [sessionMintedAt, setSessionMintedAt] = useState<number | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const cardUnavailable = !!cardError && CARD_UNAVAILABLE_CODES.has(cardError);

  const isTierChange = payment.purpose === 'TIER_CHANGE';
  const targetTierKey = payment.target_tier
    ? (`tiers.${payment.target_tier}.name` as Parameters<typeof tPricing>[0])
    : null;
  const targetTierName =
    targetTierKey && tPricing.has(targetTierKey) ? tPricing(targetTierKey) : payment.target_tier ?? '';

  function handleSelectCard() {
    setPayMethod('card');
    const isFresh = !!payphoneSession && !!sessionMintedAt && (Date.now() - sessionMintedAt < PAYPHONE_SESSION_MAX_AGE_MS);
    if (isFresh || cardPending) return;
    setCardError(null);
    startCardTransition(async () => {
      const result = await createPayphoneSessionAction(payment.id);
      if ('error' in result) {
        setCardError(result.error);
        if (CARD_UNAVAILABLE_CODES.has(result.error)) {
          setPayMethod('transfer');
          toastApiError(result.error, tError);
        }
      } else {
        setPayphoneSession(result.session);
        setSessionMintedAt(Date.now());
      }
    });
  }

  function handleUpload() {
    const files = fileInputRef.current?.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append('proof', file);
    formData.append('referenceNumber', referenceNumber.trim());
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
          : payment.purpose === 'SEAT_CHANGE'
            ? t('pendingPayment.seatChangeTitle', { seats: payment.target_extra_seats ?? 0 })
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
      {payment.total_amount && payment.iva_amount != null && payment.iva_rate != null && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('pendingPayment.ivaBreakdown', {
            rate: Math.round(payment.iva_rate * 100),
            iva: currencyFormatter.format(Number(payment.iva_amount)),
            base: currencyFormatter.format(Number(payment.amount)),
          })}
        </p>
      )}

      {payment.rejection_reason_code && (
        <p className="mt-2 text-sm text-destructive">
          {t('pendingPayment.rejected', {
            reason: t.has(`rejectionReason.${payment.rejection_reason_code}` as Parameters<typeof t>[0])
              ? t(`rejectionReason.${payment.rejection_reason_code}` as Parameters<typeof t>[0])
              : t('rejectionReason.OTHER'),
          })}
        </p>
      )}

      {canManageBilling && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => setPayMethod('transfer')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              payMethod === 'transfer' ? 'bg-muted shadow-sm' : 'text-muted-foreground',
            )}
          >
            <Landmark className="h-3.5 w-3.5" />
            {t('payphone.transferTab')}
          </button>
          <button
            type="button"
            onClick={handleSelectCard}
            disabled={cardUnavailable}
            title={cardUnavailable ? (tError.has(cardError as Parameters<typeof tError>[0]) ? tError(cardError as Parameters<typeof tError>[0]) : undefined) : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              payMethod === 'card' ? 'bg-muted shadow-sm' : 'text-muted-foreground',
            )}
          >
            <CreditCard className="h-3.5 w-3.5" />
            {t('payphone.cardTab')}
          </button>
        </div>
      )}

      {payMethod === 'transfer' && (
        bankTransfer ? (
          <div className="mt-3 space-y-1 rounded-md border border-border bg-background p-3 text-sm">
            <p className="flex items-center gap-1">
              <span className="text-muted-foreground">{t('pendingPayment.paymentCode')}:</span>{' '}
              <span className="font-mono font-medium">{payment.payment_code}</span>
              <AccessKeyCopy value={payment.payment_code} />
            </p>
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
            <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
              {t('pendingPayment.transferNote', { code: payment.payment_code })}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('pendingPayment.contactSupport')}</p>
        )
      )}

      {payMethod === 'card' && (
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-sm">
          {cardError ? (
            <div className="space-y-2">
              <p className="text-destructive">
                {tError.has(cardError) ? tError(cardError) : tError('UNKNOWN')}
              </p>
              <button
                type="button"
                onClick={() => setPayMethod('transfer')}
                className="text-xs font-medium text-primary hover:underline"
              >
                {t('payphone.useTransferInstead')}
              </button>
            </div>
          ) : cardPending || !payphoneSession ? (
            <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
              {t('payphone.mintingSession')}
            </div>
          ) : (
            <p className="mb-2 text-xs text-muted-foreground">{t('payphone.redirectNote')}</p>
          )}
        </div>
      )}

      {/* Rendered once and kept mounted (hidden via CSS, not removed from the
          tree) for as long as this session lives — Payphone's widget SDK
          rejects a second render() call for a clientTransactionId it has
          already seen, so unmounting/remounting on every "Tarjeta" tab toggle
          (as this used to do, nested inside the block above) broke the widget
          with "Ya existe una transacción..." the second time the tab was
          reopened. See CLAUDE.md Common Mistake #56. */}
      {payphoneSession && !cardError && (
        <div className={payMethod === 'card' ? 'mt-1' : 'hidden'}>
          <PayphoneCheckout key={payphoneSession.clientTransactionId} session={payphoneSession} />
        </div>
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

      {canManageBilling && payMethod === 'transfer' && (
        <div className="mt-3 space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('pendingPayment.referenceNumber')}
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder={t('pendingPayment.referenceNumberPlaceholder')}
              maxLength={50}
              disabled={isPending}
              className="block w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t('pendingPayment.referenceNumberHint')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,application/pdf"
              multiple
              disabled={isPending}
              onChange={(e) => setHasFiles(!!e.target.files?.length)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
            />
            <Button size="sm" onClick={handleUpload} disabled={isPending || !hasFiles || !referenceNumber.trim()}>
              {isPending ? t('pendingPayment.uploading') : t('pendingPayment.upload')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('pendingPayment.uploadHint')}</p>
        </div>
      )}

      {canManageBilling && canCancelPayment && (
        <div className="mt-3 border-t border-border pt-3">
          {!cancelConfirming ? (
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/5"
              onClick={() => setCancelConfirming(true)}
              disabled={cancelPending}
            >
              {t('pendingPayment.cancel')}
            </Button>
          ) : (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-2">
              <p>{t('pendingPayment.cancelConfirmHint')}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleCancelPayment} disabled={cancelPending}>
                  {cancelPending ? t('pendingPayment.cancelling') : t('pendingPayment.cancelConfirm')}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCancelConfirming(false)} disabled={cancelPending}>
                  {t('pendingPayment.cancelKeep')}
                </Button>
              </div>
            </div>
          )}
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
  paymentId: string;
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
  // Both callers (ChangeTierCard/SubscribeCard) filter their tier list to
  // only tiers selling `interval` before rendering this card, so it never
  // has to fall back to a different interval — the price is always shown
  // at the actual selected interval.
  const { base: price } = resolveTierTotal(tier, interval);
  const perLabel = tPricing(interval === 'YEARLY' ? 'perYear' : 'perMonth');
  const isHighlighted = tier.name === 'GROWTH';
  // Mirrors the pricing page: a YEARLY subscription pools the full year's
  // quota up front (documentQuota × 12) rather than resetting monthly.
  const yearlyPooled = interval === 'YEARLY';
  const quotaCount = (yearlyPooled ? (tier.documentQuota ?? 0) * 12 : tier.documentQuota) ?? 0;

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
        <p className="text-xs text-muted-foreground">
          {t('plusIva')}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {tier.documentQuota === null
          ? tPricing('features.unlimitedQuota')
          : yearlyPooled
            ? tPricing('features.quotaYearly', { count: quotaCount })
            : tPricing('features.quota', { count: quotaCount })}
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
  const tIssuers = useTranslations('issuers');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [cancelConfirming, setCancelConfirming] = useState(false);
  // Defaults to the tenant's own current tier (rather than nothing selected)
  // so the details panel always shows something on first render instead of
  // an empty state — reads as "here's your plan" until they pick a different one.
  const [selectedTier, setSelectedTier] = useState<PaidTier | null>(currentSubscriptionTier);
  const [selectedInterval, setSelectedInterval] = useState<'MONTHLY' | 'YEARLY'>(currentBillingInterval);

  const options = tiers.filter((tier): tier is ApiTierInfo & { name: PaidTier } => tier.name !== 'FREE');
  // Hides a tier entirely on an interval it doesn't sell (e.g. SOLO on
  // Mensual) instead of showing it with a mismatched price + a "yearly only"
  // caveat — mirrors the same fix on the public /pricing page.
  const visibleOptions = options.filter((tier) => tier.billingIntervals.includes(selectedInterval));

  const periodEndFormatted = currentPeriodEnd
    ? dateFormatter.format(new Date(currentPeriodEnd))
    : null;

  const currentTierInfo = tiers.find((ti) => ti.name === currentSubscriptionTier);
  const targetTierInfo = selectedTier ? tiers.find((ti) => ti.name === selectedTier) : null;
  // The interval actually submitted for the target tier — falls back off
  // `selectedInterval` when the target doesn't sell it (e.g. SOLO is
  // yearly-only), so picking SOLO while the toggle sits on Mensual can't send
  // the API an interval/tier combination it doesn't offer.
  const targetEffectiveInterval = targetTierInfo
    ? resolveTierTotal(targetTierInfo, selectedInterval).effectiveInterval
    : selectedInterval;
  const intervalChanged = targetEffectiveInterval !== currentBillingInterval;
  // Ranked by quota tier, not raw price — a tier's priceMonthlyUsd can be
  // null (SOLO has no monthly price), so comparing prices directly isn't safe.
  const isTierUpgrade = !!targetTierInfo && !!currentTierInfo &&
    TIER_RANK[targetTierInfo.name] > TIER_RANK[currentTierInfo.name];
  const isTierDowngrade = !!targetTierInfo && !!currentTierInfo &&
    TIER_RANK[targetTierInfo.name] < TIER_RANK[currentTierInfo.name];
  const isNoOp = selectedTier === currentSubscriptionTier && !intervalChanged;

  // Mirrors requestSandboxTierChange's own pricing exactly: current-tier price
  // at the CURRENT interval (what was actually paid) credited against the
  // target tier's price at the SELECTED interval — both from the same tiers
  // catalog, no time-proration (sandbox has no real period for that). Both
  // sides are tax-exclusive base prices, same as the API's own netPrice
  // calculation (breakdownAmount() adds IVA on top afterward — see
  // subscription.service.js) — shown here with a "+ IVA" note, not pre-summed.
  const sandboxNetPrice = targetTierInfo && currentTierInfo
    ? Math.max(0,
        resolveTierTotal(targetTierInfo, selectedInterval).base
          - resolveTierTotal(currentTierInfo, currentBillingInterval).base)
    : 0;

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
    // Keep the visible interval toggle in sync when the picked tier doesn't
    // sell the currently-selected interval (e.g. SOLO is yearly-only) — the
    // submitted interval already falls back via targetEffectiveInterval, but
    // leaving the toggle showing "Mensual" while Anual is what's actually
    // charged would be confusing.
    const info = tiers.find((ti) => ti.name === name);
    if (info) {
      setSelectedInterval(resolveTierTotal(info, selectedInterval).effectiveInterval);
    }
  }

  function handleChange() {
    if (!selectedTier || isNoOp) return;
    startTransition(async () => {
      const result = await changeTierAction(
        selectedTier,
        intervalChanged ? targetEffectiveInterval : undefined,
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

  // Dropdown option label: tier name + price at the currently toggled
  // interval, tagged as the current plan when it's the exact tier+interval
  // combo already active — same condition the old PlanCard grid used to mark
  // one tile 'current', just evaluated per-option instead of per-tile.
  function tierOptionLabel(tier: ApiTierInfo): string {
    const name = tPricing.has(`tiers.${tier.name}.name` as Parameters<typeof tPricing>[0])
      ? tPricing(`tiers.${tier.name}.name` as Parameters<typeof tPricing>[0])
      : tier.name;
    const { base, effectiveInterval } = resolveTierTotal(tier, selectedInterval);
    const price = `${currencyFormatter.format(base)}${tPricing(effectiveInterval === 'YEARLY' ? 'perYear' : 'perMonth')}`;
    const isCurrentOption = tier.name === currentSubscriptionTier && selectedInterval === currentBillingInterval;
    return isCurrentOption ? `${name} — ${price} ${t('changePlan.currentOptionSuffix')}` : `${name} — ${price}`;
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

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="change-tier-select">
              {t('changePlan.placeholder')}
            </label>
            <Select
              value={selectedTier ?? undefined}
              onValueChange={(value) => selectTier(value as PaidTier)}
              disabled={isPending}
            >
              <SelectTrigger id="change-tier-select" className="w-full">
                <SelectValue>
                  {(value: string | null) => {
                    const tier = tiers.find((ti) => ti.name === value);
                    return tier ? tierOptionLabel(tier) : value;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {visibleOptions.map((tier) => (
                  <SelectItem key={tier.name} value={tier.name}>
                    {tierOptionLabel(tier)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targetTierInfo && (
            <div
              className={cn(
                'flex flex-col gap-3 rounded-lg border p-4',
                isNoOp ? 'border-muted bg-muted/30' : 'border-primary/30 bg-primary/5',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">
                  {tPricing(`tiers.${targetTierInfo.name}.name` as Parameters<typeof tPricing>[0])}
                </p>
                {isNoOp ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {t('changePlan.currentPlan')}
                  </span>
                ) : targetTierInfo.name === 'GROWTH' ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {tPricing('badge.popular')}
                  </span>
                ) : null}
              </div>

              <div>
                <p className="text-2xl font-bold">
                  {currencyFormatter.format(resolveTierTotal(targetTierInfo, selectedInterval).base)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {tPricing(targetEffectiveInterval === 'YEARLY' ? 'perYear' : 'perMonth')}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">{t('plusIva')}</p>
              </div>

              <p className="text-sm text-muted-foreground">
                {tPricing(`tiers.${targetTierInfo.name}.description` as Parameters<typeof tPricing>[0])}
              </p>

              <ul className="flex flex-col gap-1.5 text-xs">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {targetTierInfo.documentQuota === null
                    ? tPricing('features.unlimitedQuota')
                    : selectedInterval === 'YEARLY'
                      ? tPricing('features.quotaYearly', { count: targetTierInfo.documentQuota * 12 })
                      : tPricing('features.quota', { count: targetTierInfo.documentQuota })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {targetTierInfo.maxBranches === null
                    ? tPricing('features.unlimitedBranches')
                    : tPricing('features.branches', { count: targetTierInfo.maxBranches })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {targetTierInfo.maxIssuePointsPerBranch === null
                    ? tPricing('features.unlimitedIssuePoints')
                    : tPricing('features.issuePoints', { count: targetTierInfo.maxIssuePointsPerBranch })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {tPricing('features.docTypes', {
                    types: targetTierInfo.allowedDocumentTypes
                      .map((code) =>
                        tIssuers.has(`docType.${code}` as Parameters<typeof tIssuers>[0])
                          ? tIssuers(`docType.${code}` as Parameters<typeof tIssuers>[0])
                          : code,
                      )
                      .join(', '),
                  })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {tPricing('features.webhooks', { count: targetTierInfo.maxWebhookEndpoints })}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  {targetTierInfo.maxUsers === null
                    ? tPricing('features.unlimitedUsers')
                    : tPricing('features.users', { count: targetTierInfo.maxUsers })}
                </li>
              </ul>

              {!isNoOp && !confirming && (
                <Button size="sm" onClick={() => setConfirming(true)} disabled={isPending} className="mt-1 self-start">
                  {t('changePlan.button')}
                </Button>
              )}

              {confirming && scenario && (
                <div className="mt-1 rounded-md border border-border bg-background p-3 text-sm space-y-2">
                  <p>
                    {/* Sandbox never prorates and never defers to period end (see
                        requestSandboxTierChange) — it only branches on isTierDowngrade,
                        ignoring the production upgrade/downgrade/interval-change
                        distinction entirely, so it needs its own two-way copy here
                        rather than reusing the production hints above. */}
                    {isSandbox
                      ? (isTierDowngrade
                          ? t('changePlan.confirmHintSandboxFree')
                          : t('changePlan.confirmHintSandboxCharge'))
                      : scenario === 'upgrade'
                        ? t('changePlan.confirmHintUpgrade')
                        : scenario === 'downgrade'
                          ? (periodEndFormatted
                              ? t('changePlan.confirmHintDowngrade', { date: periodEndFormatted })
                              : t('changePlan.confirmHintDowngradeNoDate'))
                          : (periodEndFormatted
                              ? t('changePlan.confirmHintIntervalChange', { date: periodEndFormatted })
                              : t('changePlan.confirmHintIntervalChangeNoDate'))}
                  </p>
                  {isSandbox && !isTierDowngrade && (
                    <p className="font-medium">
                      {currencyFormatter.format(sandboxNetPrice)}
                      {' '}
                      <span className="text-xs font-normal text-muted-foreground">{t('plusIva')}</span>
                    </p>
                  )}
                  {!isSandbox && scenario !== 'upgrade' && (
                    <p className="font-medium">
                      {currencyFormatter.format(resolveTierTotal(targetTierInfo, selectedInterval).base)}
                      {tPricing(targetEffectiveInterval === 'YEARLY' ? 'perYear' : 'perMonth')}
                      {' '}
                      <span className="text-xs font-normal text-muted-foreground">{t('plusIva')}</span>
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
          )}
        </div>
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

// Extra user seats add-on (ADR-032) — a flat-priced, quantity-based purchase
// against comprobify-web's own maxUsers cap (see src/lib/tenant-limits.ts).
// Deliberately a separate card from ChangeTierCard rather than folded into
// it: seats have only two scenarios (increase/decrease, no interval-change —
// they always follow the subscription's own billing_interval) and a plain
// count input, not a tier picker, so sharing ChangeTierCard's three-scenario
// state machine would add more complexity than it would save.
function SeatsCard({
  extraSeat,
  currentExtraSeats,
  pendingExtraSeats,
  currentBillingInterval,
  currentPeriodEnd,
  isSandbox,
}: {
  extraSeat: ApiExtraSeatPricing;
  currentExtraSeats: number;
  pendingExtraSeats: number | null;
  currentBillingInterval: 'MONTHLY' | 'YEARLY';
  currentPeriodEnd: string | null;
  isSandbox: boolean;
}) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState(currentExtraSeats);

  const periodEndFormatted = currentPeriodEnd ? dateFormatter.format(new Date(currentPeriodEnd)) : null;
  const isNoOp = selectedSeats === currentExtraSeats;
  const isDecrease = selectedSeats < currentExtraSeats;
  const scenario: 'increase' | 'decrease' | null = isNoOp ? null : isDecrease ? 'decrease' : 'increase';
  // Base (tax-exclusive) unit price — shown as "$X + IVA", not a bundled total.
  const seatUnitBasePrice = resolveSeatBasePrice(extraSeat, currentBillingInterval);
  // Flat per-seat pricing, unlike a tier's price — no "credit for what was
  // already paid" needed, the net difference is just delta × unit price
  // (mirrors requestSandboxSeatChange's own seatDelta * seatPrice math).
  const sandboxNetPrice = Math.max(0, (selectedSeats - currentExtraSeats) * seatUnitBasePrice);

  function handleChange() {
    if (isNoOp) return;
    startTransition(async () => {
      const result = await changeSeatsAction(selectedSeats);
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      setConfirming(false);
      if (result.effectiveAt && !result.payment) {
        toast.success(t('changeSeats.decreaseScheduled'));
      } else if (result.payment) {
        toast.success(t('changeSeats.increaseRequested'));
      } else {
        toast.success(t('changeSeats.increaseApplied'));
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{t('changeSeats.title')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('changeSeats.hint')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('changeSeats.unitPrice', {
            price: currencyFormatter.format(seatUnitBasePrice),
            interval: tPricing(currentBillingInterval === 'YEARLY' ? 'perYear' : 'perMonth'),
          })}
        </p>
      </div>

      {pendingExtraSeats !== null && periodEndFormatted && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {t('changeSeats.decreasePending', { seats: pendingExtraSeats, date: periodEndFormatted })}
        </p>
      )}

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="extra-seats-input">
          {t('changeSeats.seatsLabel')}
        </label>
        <input
          id="extra-seats-input"
          type="number"
          min={0}
          max={100}
          value={selectedSeats}
          onChange={(e) => {
            setConfirming(false);
            const parsed = Number(e.target.value);
            setSelectedSeats(Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.trunc(parsed))) : 0);
          }}
          disabled={isPending}
          className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <span className="text-xs text-muted-foreground">
          {t('changeSeats.currentCount', { count: currentExtraSeats })}
        </span>
      </div>

      {!isNoOp && !confirming && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={isPending}>
            {t('changeSeats.button')}
          </Button>
        </div>
      )}

      {confirming && scenario && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-2">
          <p>
            {isSandbox
              ? (scenario === 'decrease'
                  ? t('changeSeats.confirmHintSandboxFree')
                  : t('changeSeats.confirmHintSandboxCharge'))
              : scenario === 'increase'
                ? t('changeSeats.confirmHintIncrease')
                : (periodEndFormatted
                    ? t('changeSeats.confirmHintDecrease', { date: periodEndFormatted })
                    : t('changeSeats.confirmHintDecreaseNoDate'))}
          </p>
          {isSandbox && scenario === 'increase' && (
            <p className="font-medium">
              {currencyFormatter.format(sandboxNetPrice)}
              {' '}
              <span className="text-xs font-normal text-muted-foreground">{t('plusIva')}</span>
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleChange} disabled={isPending}>
              {isPending ? t('changeSeats.confirming') : t('changeSeats.confirm')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={isPending}>
              {t('changeSeats.cancel')}
            </Button>
          </div>
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
  currentSubscriptionTier,
}: {
  tiers: ApiTierInfo[];
  emailVerified: boolean;
  intendedTier?: PaidTier;
  intendedBillingInterval?: BillingInterval;
  currentSubscriptionTier: string;
}) {
  const t = useTranslations('billing');
  const tPricing = useTranslations('pricing');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PaidTier | null>(intendedTier ?? null);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(intendedBillingInterval ?? 'MONTHLY');
  const options = tiers.filter((tier): tier is ApiTierInfo & { name: PaidTier } => tier.name !== 'FREE');
  // Hides a tier entirely on an interval it doesn't sell (e.g. SOLO on
  // Mensual) instead of showing it with a mismatched price + a "yearly only"
  // caveat — mirrors the same fix on the public /pricing page. `options`
  // itself stays unfiltered since selectTier/handleSubscribe/selectedTierInfo
  // need to resolve a selection regardless of the toggle's current position
  // (e.g. a pre-filled intendedTier of SOLO before the user touches the toggle).
  const visibleOptions = options.filter((tier) => tier.billingIntervals.includes(billingInterval));
  // FREE is display-only (never purchased, billingIntervals: ['MONTHLY'] on
  // the API — see subscription-tiers.js) but this card only ever renders
  // while the tenant has no active/pending subscription, which means they
  // are actually sitting on FREE right now — show it alongside the paid
  // options, non-selectable, so the grid reads as "here's your current plan
  // and what you could upgrade to" instead of silently omitting it.
  const freeTier = currentSubscriptionTier === 'FREE'
    ? tiers.find((tier) => tier.name === 'FREE' && tier.billingIntervals.includes(billingInterval))
    : undefined;

  function selectTier(name: PaidTier) {
    setSelectedTier(name);
    setConfirming(false);
    // Keep the visible interval toggle in sync when the picked tier doesn't
    // sell the currently-selected interval (e.g. SOLO is yearly-only).
    const info = options.find((o) => o.name === name);
    if (info) setBillingInterval(resolveTierTotal(info, billingInterval).effectiveInterval);
  }

  function handleSubscribe() {
    if (!selectedTier) return;
    // Resolve the actual interval to submit off the tier's own billingIntervals,
    // not the raw toggle state — guards against the toggle being clicked back to
    // an interval the selected tier doesn't sell (e.g. Mensual after picking SOLO).
    const info = options.find((o) => o.name === selectedTier);
    const effectiveInterval = info ? resolveTierTotal(info, billingInterval).effectiveInterval : billingInterval;
    startTransition(async () => {
      const result = await createSubscriptionAction(selectedTier, effectiveInterval);
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
            {freeTier && (
              <PlanCard key={freeTier.name} tier={freeTier} interval={billingInterval} state="current" />
            )}
            {visibleOptions.map((tier) => (
              <PlanCard
                key={tier.name}
                tier={tier}
                interval={billingInterval}
                state={selectedTier === tier.name ? 'selected' : 'default'}
                onClick={() => selectTier(tier.name as PaidTier)}
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
                {currencyFormatter.format(resolveTierTotal(selectedTierInfo, billingInterval).base)}
                {tPricing(resolveTierTotal(selectedTierInfo, billingInterval).effectiveInterval === 'YEARLY' ? 'perYear' : 'perMonth')}
                {' '}
                <span className="text-xs font-normal text-muted-foreground">{t('plusIva')}</span>
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
