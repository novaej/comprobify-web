'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, Copy, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { finishPromotionAction } from '@/app/actions/tenant';

// Shown once, right after promotion: the tenant's own sandbox keys were revoked
// and replaced by new production tokens, which are never retrievable again.
// Not dismissible except via the button, since closing it any other way would
// lose the only copy.
export function PromotionKeysDialog({
  keys,
  goToBilling,
}: {
  keys: { label: string; key: string }[];
  goToBilling: boolean;
}) {
  const t = useTranslations('settings.promote.keys');
  const [isPending, startTransition] = useTransition();
  const [visible, setVisible] = useState<Set<number>>(() => new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const confirmedRef = useRef(false);

  // Warn on reload/close — the keys only exist in this dialog's memory.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (confirmedRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  function toggleVisible(index: number) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function copy(index: number, value: string) {
    navigator.clipboard.writeText(value);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 2000);
  }

  function handleDone() {
    if (isPending) return;
    confirmedRef.current = true;
    startTransition(async () => {
      await finishPromotionAction(goToBilling);
    });
  }

  return (
    <Dialog open disablePointerDismissal onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{t('showOnce')}</p>
        </div>

        <div className="space-y-3">
          {keys.map((item, index) => (
            <div key={index} className="space-y-1.5 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{item.label}</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 rounded bg-muted px-2 py-1 font-mono text-xs break-all">
                  {visible.has(index) ? item.key : '•'.repeat(40)}
                </code>
                <button
                  type="button"
                  onClick={() => toggleVisible(index)}
                  aria-label={visible.has(index) ? t('hide') : t('show')}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {visible.has(index) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <Button size="sm" variant="outline" onClick={() => copy(index, item.key)}>
                  {copiedIndex === index ? (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <Copy className="mr-1 h-3.5 w-3.5" />
                  )}
                  {t('copy')}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button onClick={handleDone} disabled={isPending}>
            {isPending ? t('continuing') : t('continue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
