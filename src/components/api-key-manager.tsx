'use client';

import { Fragment, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createTenantApiKeyAction, revokeTenantApiKeyAction } from '@/app/actions/apiKeys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, BarChart3, Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, ExternalLink, Key, Lock, Plus } from 'lucide-react';
import { toastApiError } from '@/lib/api-error-toast';
import { ApiKeyUsageChart } from '@/components/api-key-usage-chart';
import { ALL_API_SCOPES, type ApiKeyScope } from '@/lib/role-api-scopes';

const API_DOCS_URL = 'https://docs.comprobify.com/';

interface ApiKeyRow {
  id: string;
  label: string;
  environment: string;
  lastFour: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
  /** True for the app's own master key or a per-role key — cannot be revoked. */
  isManaged: boolean;
  /** Set only on a narrower per-role key; null for the master key and self-service keys. */
  managedRole: string | null;
  scopes: string[];
}

export function ApiKeyManager({
  keys,
  canManage,
  missingKey,
  environment,
  apiBaseUrl,
  callerScopes,
  activeKeyCount,
  maxApiKeys,
  customKeysAllowed,
}: {
  keys: ApiKeyRow[];
  canManage: boolean;
  missingKey: boolean;
  environment: string;
  apiBaseUrl: string;
  /** Scopes the current user's own key holds — bounds what a new key can be created with. */
  callerScopes: ApiKeyScope[];
  /** Active keys for the tenant's current environment — used against maxApiKeys (ADR-031). */
  activeKeyCount: number;
  /** null = unlimited (ENTERPRISE). */
  maxApiKeys: number | null;
  /**
   * Whether the tenant's own tier sells any self-service API keys at all
   * (FREE/SOLO/LITE currently don't — see ADR-034). Independent of
   * `activeKeyCount`/`maxApiKeys`, which fold in a reserved pool for
   * comprobify-web's own master/per-role keys that a FREE/SOLO/LITE tenant
   * could otherwise spend on self-service keys of their own.
   */
  customKeysAllowed: boolean;
}) {
  const t = useTranslations('apiKeys');
  const tRole = useTranslations('users');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<Set<ApiKeyScope>>(() => new Set(callerScopes));
  const [createdKey, setCreatedKey] = useState<{ key: string; label: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  function copy(value: string, slot: string) {
    navigator.clipboard.writeText(value);
    setCopied(slot);
    setTimeout(() => setCopied((c) => (c === slot ? null : c)), 2000);
  }

  function toggleScope(scope: ApiKeyScope) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  function handleCreate() {
    if (selectedScopes.size === 0) {
      toast.error(t('scopesRequired'));
      return;
    }
    startTransition(async () => {
      const result = await createTenantApiKeyAction(newLabel || 'default', Array.from(selectedScopes));
      if (result && 'error' in result) {
        toastApiError(result.error, tError);
      } else if (result && 'key' in result) {
        setCreatedKey(result);
        setNewLabel('');
        setSelectedScopes(new Set(callerScopes));
        setShowCreate(false);
        setShowKey(false);
        toast.success(t('createSuccess', { label: result.label }));
      }
    });
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    const id = revokeTarget.id;
    startTransition(async () => {
      const result = await revokeTenantApiKeyAction(id);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('revokeSuccess'));
      }
      setRevokeTarget(null);
    });
  }

  const curlSnippet = `curl ${apiBaseUrl}/v1/documents \\\n  -H "Authorization: Bearer ${createdKey?.key ?? t('usage.keyPlaceholder')}"`;
  const atKeyLimit = maxApiKeys !== null && activeKeyCount >= maxApiKeys;
  const createDisabled = atKeyLimit || !customKeysAllowed;

  return (
    <div className="space-y-4">
      {missingKey && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('missingKeyWarning')}
        </div>
      )}

      {!customKeysAllowed ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('noCustomAccess')}
        </div>
      ) : atKeyLimit && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('keyLimitReached', { used: activeKeyCount, limit: maxApiKeys })}
        </div>
      )}

      {createdKey && (
        <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-500/30 dark:bg-green-500/10">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            {t('createdSuccess', { label: createdKey.label })}
          </p>
          <p className="text-xs text-green-700 dark:text-green-400">{t('showOnce')}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 rounded bg-white/60 px-2 py-1 font-mono text-xs break-all dark:bg-black/20">
              {showKey ? createdKey.key : '•'.repeat(40)}
            </code>
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? t('hide') : t('show')}
              className="shrink-0 text-green-700 dark:text-green-400"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(createdKey.key, 'key')}>
              {copied === 'key' ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
              {t('copy')}
            </Button>
            <button
              type="button"
              onClick={() => setCreatedKey(null)}
              className="text-xs text-green-700 underline dark:text-green-400"
            >
              {t('dismiss')}
            </button>
          </div>
        </div>
      )}

      {canManage &&
        (showCreate ? (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <Input
              placeholder={t('labelPlaceholder')}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              disabled={isPending}
              className="sm:max-w-xs"
            />

            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('selectScopes')}</p>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {callerScopes.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedScopes.has(scope)}
                      onChange={() => toggleScope(scope)}
                      disabled={isPending}
                      className="h-4 w-4 rounded border-border"
                    />
                    {t(`scopeLabels.${scope}`)}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleCreate} disabled={isPending || createDisabled}>
                {isPending ? t('creating') : t('create')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)} disabled={isPending}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={() => setShowCreate(true)} disabled={createDisabled}>
            <Plus className="mr-1 h-4 w-4" />
            {t('createKey')}
          </Button>
        ))}

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.label')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.scopes')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.environment')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.lastFour')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.status')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.created')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.lastUsed')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.requests')}</th>
                  <th className="px-4 py-3" />
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((k) => {
                  const isExpanded = expandedId === k.id;
                  const columnCount = 9 + (canManage ? 1 : 0);
                  const isFullAccess = ALL_API_SCOPES.every((s) => k.scopes.includes(s));
                  return (
                    <Fragment key={k.id}>
                    <tr className={k.isActive ? '' : 'opacity-50'}>
                      <td className="px-4 py-3 font-medium">
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-2">
                            <Key className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            {k.label}
                          </span>
                          {k.isManaged && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              {k.managedRole ? t('appKeyBadgeRole', { role: tRole(`role.${k.managedRole}`) }) : t('appKeyBadge')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {k.scopes.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : isFullAccess ? (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {t('fullAccess')}
                          </span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {k.scopes.map((scope) => (
                              <span
                                key={scope}
                                title={t.has(`scopeLabels.${scope}`) ? t(`scopeLabels.${scope}` as never) : undefined}
                                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
                              >
                                {scope}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{k.environment}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">••••{k.lastFour}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            k.isActive
                              ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {k.isActive ? t('status.active') : t('status.revoked')}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {new Date(k.createdAt).toLocaleDateString('es-EC')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString('es-EC') : t('table.neverUsed')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {k.requestCount.toLocaleString('es-EC')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setExpandedId((id) => (id === k.id ? null : k.id))}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          {t('usageChart.viewUsage')}
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          {k.isActive &&
                            (k.isManaged ? (
                              <span className="text-xs text-muted-foreground">{t('appKeyLocked')}</span>
                            ) : (
                              <button
                                onClick={() => setRevokeTarget(k)}
                                disabled={isPending}
                                className="text-xs text-destructive hover:underline disabled:opacity-50"
                              >
                                {t('revoke')}
                              </button>
                            ))}
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr className={k.isActive ? '' : 'opacity-50'}>
                        <td colSpan={columnCount} className="bg-muted/10 px-4 py-3">
                          <ApiKeyUsageChart keyId={k.id} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {customKeysAllowed && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <h2 className="text-sm font-semibold">{t('usage.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('usage.description', { environment: t(`environmentNames.${environment}`) })}
          </p>

          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">{t('usage.baseUrl')}</dt>
              <dd className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">{apiBaseUrl}</code>
                <Button size="sm" variant="outline" onClick={() => copy(apiBaseUrl, 'url')}>
                  {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">{t('usage.header')}</dt>
              <dd className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                  Authorization: Bearer {t('usage.keyPlaceholder')}
                </code>
                <Button size="sm" variant="outline" onClick={() => copy('Authorization', 'header')}>
                  {copied === 'header' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">{t('usage.curl')}</dt>
              <dd className="mt-1 flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
                  {curlSnippet}
                </pre>
                <Button size="sm" variant="outline" onClick={() => copy(curlSnippet, 'curl')}>
                  {copied === 'curl' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </dd>
            </div>
          </dl>

          <a
            href={API_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
          >
            {t('usage.docsLink')}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('confirmRevokeTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('confirmRevokeDescription')}</p>
          {revokeTarget && (
            <p className="text-sm font-medium">{revokeTarget.label} · ••••{revokeTarget.lastFour}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={isPending}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={isPending}>
              {t('revoke')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
