'use client';

import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { RotateCw } from 'lucide-react';

export function AdminRateLimitRetryButton({ label }: { label: string }) {
  const router = useRouter();

  return (
    <Button size="sm" variant="outline" className="shrink-0" onClick={() => router.refresh()}>
      <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
      {label}
    </Button>
  );
}
