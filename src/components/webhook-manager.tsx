'use client';

import { useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { registerWebhookAction, deleteWebhookAction, activateCanonicalWebhookAction } from '@/app/actions/webhooks';
import { toastApiError } from '@/lib/api-error-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Plus, Webhook, Trash2, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

const ALL_EVENT_TYPES = [
  'DOCUMENT_AUTHORIZED',
  'CERT_EXPIRING',
  'CERT_EXPIRED',
  'SRI_SUBMISSION_FAILED',
  'EMAIL_DELIVERY_FAILED',
  'QUOTA_WARNING',
] as const;

interface WebhookRow {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
}

export type CanonicalAvailability = 'available' | 'not_configured' | 'invalid_url';

interface WebhookManagerProps {
  endpoints: WebhookRow[];
  canonicalAvailability: CanonicalAvailability;
  canonicalEndpointId: string | null;
  /** Active endpoints against the plan's own self-service pool (comprobify-web's canonical webhook is excluded entirely, not counted). */
  usedEndpoints: number;
  /** null = unlimited. */
  maxEndpoints: number | null;
  /** Whether the tenant's own tier sells any self-service webhook slots at all (FREE/SOLO/LITE currently don't). */
  customWebhooksAllowed: boolean;
}

export function WebhookManager({
  endpoints: initial,
  canonicalAvailability,
  canonicalEndpointId,
  usedEndpoints,
  maxEndpoints,
  customWebhooksAllowed,
}: WebhookManagerProps) {
  const t = useTranslations('webhooks');
  const tError = useTranslations('apiError');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [endpoints, setEndpoints] = useState<WebhookRow[]>(initial);
  const [canonicalId, setCanonicalId] = useState<string | null>(canonicalEndpointId);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]); // empty = all
  const [showEventPicker, setShowEventPicker] = useState(false);

  const atEndpointLimit = maxEndpoints !== null && usedEndpoints >= maxEndpoints;
  const customWebhookDisabled = atEndpointLimit || !customWebhooksAllowed;

  function handleActivateCanonical() {
    startTransition(async () => {
      const result = await activateCanonicalWebhookAction();
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('canonical.activateSuccess'));
        window.location.reload();
      }
    });
  }

  function handleDeactivateCanonical() {
    if (canonicalId === null) return;
    if (!confirm(t('canonical.confirmDeactivate'))) return;
    startTransition(async () => {
      const result = await deleteWebhookAction(canonicalId);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('canonical.deactivateSuccess'));
        setCanonicalId(null);
      }
    });
  }

  function toggleType(type: string) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function handleRegister() {
    if (!url.trim()) return;
    startTransition(async () => {
      const result = await registerWebhookAction(url.trim(), selectedTypes.length > 0 ? selectedTypes : undefined);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('registerSuccess'));
        setShowForm(false);
        setUrl('');
        setSelectedTypes([]);
        // Reload the page data via a soft refresh is not needed — we optimistically
        // add a placeholder row. A real row will show on next hard load.
        // For now, signal the user to refresh if they want the endpoint id.
        // A better UX would use router.refresh(), but that re-runs the server
        // component query which is fine here.
        window.location.reload();
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      const result = await deleteWebhookAction(id);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('deleteSuccess'));
        setEndpoints((prev) => prev.filter((e) => e.id !== id));
      }
    });
  }

  return (
    <div className="space-y-4">
      {!customWebhooksAllowed ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('noCustomAccess')}
        </div>
      ) : atEndpointLimit && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('limitReached', { used: usedEndpoints, limit: maxEndpoints })}
        </div>
      )}

      {/* Canonical in-app notification webhook */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">{t('canonical.title')}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('canonical.description')}</p>
              {canonicalAvailability === 'not_configured' && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">{t('canonical.appUrlNotConfigured')}</p>
              )}
              {canonicalAvailability === 'invalid_url' && (
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1.5">{t('canonical.httpsRequired')}</p>
              )}
            </div>
          </div>
          {canonicalAvailability === 'available' && (
            canonicalId !== null ? (
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-400">
                  {t('status.active')}
                </span>
                <Button size="sm" variant="outline" onClick={handleDeactivateCanonical} disabled={isPending}>
                  {t('canonical.deactivate')}
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={handleActivateCanonical} disabled={isPending || atEndpointLimit} className="shrink-0">
                {isPending ? t('canonical.activating') : t('canonical.activate')}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Register form */}
      {showForm ? (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold">{t('add')}</h2>

          {/* URL field */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              URL
            </label>
            <Input
              type="url"
              placeholder={t('urlPlaceholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isPending}
              className="font-mono text-sm"
            />
          </div>

          {/* Event type picker */}
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={() => setShowEventPicker((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
            >
              {t('table.events')}
              {showEventPicker ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              <span className="normal-case ml-1 font-normal text-muted-foreground/70">
                {selectedTypes.length === 0
                  ? `(${t('allEvents')})`
                  : `(${selectedTypes.length} seleccionados)`}
              </span>
            </button>
            {showEventPicker && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
                {ALL_EVENT_TYPES.map((type) => (
                  <label
                    key={type}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-xs transition-colors',
                      selectedTypes.includes(type)
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40'
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={selectedTypes.includes(type)}
                      onChange={() => toggleType(type)}
                      disabled={isPending}
                    />
                    <span className="font-mono">{type}</span>
                  </label>
                ))}
              </div>
            )}
            {!showEventPicker && selectedTypes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t('allEvents')} — {t('description')}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleRegister} disabled={isPending || !url.trim() || customWebhookDisabled}>
              {isPending ? t('registering') : t('register')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setShowForm(false); setUrl(''); setSelectedTypes([]); }}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={() => setShowForm(true)} disabled={customWebhookDisabled}>
          <Plus className="h-4 w-4 mr-1.5" />
          {t('add')}
        </Button>
      )}

      {/* Endpoint list */}
      {endpoints.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <Webhook className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('table.url')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden sm:table-cell">
                    {t('table.events')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                    {t('table.status')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hidden lg:table-cell">
                    {t('table.created')}
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {endpoints.map((ep) => (
                  <tr key={ep.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <Webhook className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-xs break-all">{ep.url}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {ep.eventTypes.length === 0 ? (
                        <span className="text-xs text-muted-foreground">{t('allEvents')}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {ep.eventTypes.map((type) => (
                            <span
                              key={type}
                              className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        ep.active
                          ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {ep.active ? t('status.active') : t('status.inactive')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                      {format.dateTime(new Date(ep.createdAt), { dateStyle: 'medium' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(ep.id)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
                        aria-label={t('delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{t('delete')}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Signing verification hint */}
      {endpoints.length > 0 && (
        <details className="rounded-xl border border-border bg-card/60 text-sm">
          <summary className="cursor-pointer select-none px-5 py-3.5 font-medium text-muted-foreground hover:text-foreground transition-colors">
            {t('verifyTitle')}
          </summary>
          <div className="border-t border-border px-5 py-4 space-y-3">
            <p className="text-xs text-muted-foreground">{t('verifyDescription')}</p>
            <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-3 text-[11px] leading-relaxed text-foreground/80">
{`const crypto = require('crypto');

function verifyWebhook(secret, req) {
  const timestamp = req.headers['x-comprobify-timestamp'];
  const signature = req.headers['x-comprobify-signature'];
  const rawBody   = req.rawBody; // string before JSON.parse

  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}`}
            </pre>
          </div>
        </details>
      )}
    </div>
  );
}
