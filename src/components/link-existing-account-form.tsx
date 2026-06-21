'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { linkExistingTenantAction } from '@/app/actions/onboarding';

export function LinkExistingAccountForm() {
  const t = useTranslations('onboarding');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await linkExistingTenantAction(formData);
        if (result && 'error' in result) {
          const code = result.error;
          setError(tError.has(code as Parameters<typeof tError>[0])
            ? tError(code as Parameters<typeof tError>[0])
            : tError('UNKNOWN'));
        }
      } catch {
        setError(tError('UNKNOWN'));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('linkDescription')}</p>

      <div className="space-y-1.5">
        <Label htmlFor="apiKey">{t('apiKey')} *</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          required
          disabled={isPending}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? t('linkSubmitting') : t('linkSubmit')}
      </Button>
    </form>
  );
}
