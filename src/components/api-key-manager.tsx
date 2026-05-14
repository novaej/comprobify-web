'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { createTenantApiKeyAction, revokeTenantApiKeyAction } from '@/app/actions/apiKeys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Eye, EyeOff, Key, Plus } from 'lucide-react';

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
  hasActiveKey,
  missingKey,
}: {
  keys: ApiKeyRow[];
  canManage: boolean;
  hasActiveKey: boolean;
  missingKey: boolean;
}) {
  const t = useTranslations('apiKeys');
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ key: string; label: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createTenantApiKeyAction(newLabel || 'default');
      if (result && 'error' in result) {
        setError(result.error);
      } else if (result && 'key' in result) {
        setCreatedKey(result);
        setNewLabel('');
        setShowCreate(false);
        setShowKey(false);
      }
    });
  }

  function handleRevoke(id: number) {
    if (!confirm(t('confirmRevoke'))) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeTenantApiKeyAction(id);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {missingKey && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t('missingKeyWarning')}
        </div>
      )}

      {createdKey && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-500/30 dark:bg-green-500/10 space-y-2">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            {t('createdSuccess', { label: createdKey.label })}
          </p>
          <p className="text-xs text-green-700 dark:text-green-400">{t('showOnce')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white/60 px-2 py-1 font-mono text-xs break-all dark:bg-black/20">
              {showKey ? createdKey.key : '•'.repeat(40)}
            </code>
            <button onClick={() => setShowKey((v) => !v)} className="text-green-700 dark:text-green-400">
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(createdKey.key); }}>
            {t('copy')}
          </Button>
          <button onClick={() => setCreatedKey(null)} className="block text-xs text-green-600 underline mt-1">
            {t('dismiss')}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {canManage && (
        showCreate ? (
          <div className="flex items-center gap-2">
            <Input
              placeholder={t('labelPlaceholder')}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              disabled={isPending}
              className="max-w-xs"
            />
            <Button size="sm" onClick={handleCreate} disabled={isPending}>
              {isPending ? t('creating') : t('create')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowCreate(false)} disabled={isPending}>
              {t('cancel')}
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('createKey')}
          </Button>
        )
      )}

      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
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
                {keys.map((k) => (
                  <tr key={k.id} className={k.isActive ? '' : 'opacity-50'}>
                    <td className="px-4 py-3 font-medium">
                      <span className="flex items-center gap-2">
                        <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {k.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{k.environment}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">••••{k.lastFour}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${k.isActive ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        {k.isActive ? t('status.active') : t('status.revoked')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(k.createdAt).toLocaleDateString('es-EC')}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {k.isActive && (
                          <button
                            onClick={() => handleRevoke(k.id)}
                            disabled={isPending}
                            className="text-xs text-destructive hover:underline disabled:opacity-50"
                          >
                            {t('revoke')}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
