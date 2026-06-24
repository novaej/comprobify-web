'use client';

import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { format, parse } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentStatus } from '@/lib/api';

const DEBOUNCE_MS = 400;
const ALL_STATUSES = 'all';
// Mirrors DOCUMENT_STATUSES in src/lib/api.ts — duplicated as a literal because
// that module is server-only and cannot be imported (even for a value) from here.
const STATUSES: DocumentStatus[] = ['SIGNED', 'RECEIVED', 'AUTHORIZED', 'RETURNED', 'NOT_AUTHORIZED'];

interface DocumentFiltersProps {
  labels: {
    sequential: string;
    sequentialPlaceholder: string;
    buyerName: string;
    buyerNamePlaceholder: string;
    date: string;
    datePlaceholder: string;
    status: string;
    allStatuses: string;
    clear: string;
  };
}

export function DocumentFilters({ labels }: DocumentFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const tStatus = useTranslations('status');

  const [sequential, setSequential] = useState(searchParams.get('sequential') ?? '');
  const [buyerName, setBuyerName] = useState(searchParams.get('buyerName') ?? '');
  const sequentialTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const buyerNameTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dateParam = searchParams.get('date');
  const selectedDate = dateParam ? parse(dateParam, 'yyyy-MM-dd', new Date()) : undefined;
  const status = searchParams.get('status') ?? ALL_STATUSES;

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  function handleDebouncedChange(
    key: string,
    value: string,
    timeoutRef: React.RefObject<ReturnType<typeof setTimeout> | undefined>
  ) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => updateParam(key, value || null), DEBOUNCE_MS);
  }

  const hasFilters = Boolean(sequential || buyerName || dateParam || (status !== ALL_STATUSES));

  function clearAll() {
    setSequential('');
    setBuyerName('');
    router.replace(pathname);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{labels.sequential}</label>
        <Input
          value={sequential}
          onChange={(e) => {
            setSequential(e.target.value);
            handleDebouncedChange('sequential', e.target.value, sequentialTimeout);
          }}
          placeholder={labels.sequentialPlaceholder}
          className="w-36"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{labels.buyerName}</label>
        <Input
          value={buyerName}
          onChange={(e) => {
            setBuyerName(e.target.value);
            handleDebouncedChange('buyerName', e.target.value, buyerNameTimeout);
          }}
          placeholder={labels.buyerNamePlaceholder}
          className="w-44"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{labels.date}</label>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className={cn('w-40 justify-start gap-2 font-normal', !selectedDate && 'text-muted-foreground')}
              >
                <CalendarIcon className="h-4 w-4" />
                {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : labels.datePlaceholder}
              </Button>
            }
          />
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              locale={locale === 'es' ? es : enUS}
              selected={selectedDate}
              onSelect={(date) => updateParam('date', date ? format(date, 'yyyy-MM-dd') : null)}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">{labels.status}</label>
        <Select<string>
          value={status}
          onValueChange={(value) => updateParam('status', value === ALL_STATUSES ? null : value)}
        >
          <SelectTrigger className="w-40">
            <SelectValue>
              {(value: string | null) =>
                !value || value === ALL_STATUSES ? labels.allStatuses : tStatus(value)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>{labels.allStatuses}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {tStatus(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5">
          <X className="h-3.5 w-3.5" />
          {labels.clear}
        </Button>
      )}
    </div>
  );
}
