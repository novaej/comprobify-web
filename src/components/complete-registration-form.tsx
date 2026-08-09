'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { completeRegistrationAction } from '@/app/actions/auth';

interface CompleteRegistrationFormProps {
  token: string;
  email: string;
}

export function CompleteRegistrationForm({ token, email }: CompleteRegistrationFormProps) {
  const t = useTranslations('completeRegistration');
  const tAuth = useTranslations('auth');
  const tError = useTranslations('completeRegistrationError');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value;

    if (password !== confirm) {
      setError(t('passwordMismatch'));
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await completeRegistrationAction(token, password);
      if (result?.error) {
        const key = result.error as Parameters<typeof tError>[0];
        setError(tError.has(key) ? tError(key) : t('unexpectedError'));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">{tAuth('fields.email')}</Label>
        {/* Display-only — identity comes from the token, not this field, so
            it's never submitted and can't be edited to target another account. */}
        <Input id="email" type="email" value={email} disabled readOnly className="bg-muted/60" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{tAuth('fields.password')}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={isPending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">{tAuth('fields.confirmPassword')}</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={isPending}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
