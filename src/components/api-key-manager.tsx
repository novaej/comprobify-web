'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createTenantApiKeyAction, revokeTenantApiKeyAction } from '@/app/actions/apiKeys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Check, Copy, Eye, EyeOff, ExternalLink, Key, Lock, Plus } from 'lucide-react';
import { toastApiError } from '@/lib/api-error-toast';

const API_DOCS_URL = 'https://docs.comprobify.com/';

interface ApiKeyRow {
  id: number;
  label: string;
  environment: string;
  lastFour: string;
  isActive: boolean;
  createdAt: string;
}

export function ApiKeyManager({
  keys,
  canManage,
  missingKey,
  appKeyId,
  environment,
  apiBaseUrl,
}: {
  keys: ApiKeyRow[];
  canManage: boolean;
  missingKey: boolean;
  /** Row the web app itself authenticates with — cannot be revoked. */
  appKeyId: number | null;
  environment: string;
  apiBaseUrl: string;
}) {
  const t = useTranslations('apiKeys');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ key: string; label: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, slot: string) {
    navigator.clipboard.writeText(value);
    setCopied(slot);
    setTimeout(() => setCopied((c) => (c === slot ? null : c)), 2000);
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createTenantApiKeyAction(newLabel || 'default');
      if (result && 'error' in result) {
        toastApiError(result.error, tError);
      } else if (result && 'key' in result) {
        setCreatedKey(result);
        setNewLabel('');
        setShowCreate(false);
        setShowKey(false);
        toast.success(t('createSuccess', { label: result.label }));
      }
    });
  }

  function handleRevoke(id: number) {
    if (!confirm(t('confirmRevoke'))) return;
    startTransition(async () => {
      const result = await revokeTenantApiKeyAction(id);
      if (result?.error) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('revokeSuccess'));
      }
    });
  }

  const curlSnippet = `curl ${apiBaseUrl}/v1/documents \\\n  -H "Authorization: Bearer ${createdKey?.key ?? t('usage.keyPlaceholder')}"`;

  return (
    <div className="space-y-4">
      {missingKey && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('missingKeyWarning')}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder={t('labelPlaceholder')}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              disabled={isPending}
              className="sm:max-w-xs"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleCreate} disabled={isPending}>
                {isPending ? t('creating') : t('create')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)} disabled={isPending}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('createKey')}
          </Button>
        ))}

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.label')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.environment')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.lastFour')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.status')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('table.created')}</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((k) => {
                  const isAppKey = k.id === appKeyId;
                  return (
                    <tr key={k.id} className={k.isActive ? '' : 'opacity-50'}>
                      <td className="px-4 py-3 font-medium">
                        <span className="flex items-center gap-2">
                          <Key className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {k.label}
                          {isAppKey && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              {t('appKeyBadge')}
                            </span>
                          )}
                        </span>
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
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          {k.isActive &&
                            (isAppKey ? (
                              <span className="text-xs text-muted-foreground">{t('appKeyLocked')}</span>
                            ) : (
                              <button
                                onClick={() => handleRevoke(k.id)}
                                disabled={isPending}
                                className="text-xs text-destructive hover:underline disabled:opacity-50"
                              >
                                {t('revoke')}
                              </button>
                            ))}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
    </div>
  );
}
