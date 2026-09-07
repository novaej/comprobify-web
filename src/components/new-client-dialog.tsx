'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createClientAction, type SavedClient } from '@/app/actions/clients';

// Consumidor Final excluded — not a real client
const CLIENT_ID_TYPES = [
  { code: '04', labelKey: '04' as const },
  { code: '05', labelKey: '05' as const },
  { code: '06', labelKey: '06' as const },
  { code: '08', labelKey: '08' as const },
] as const;

const newClientSchema = z.object({
  idType: z.string().min(2),
  idNumber: z.string().min(1, 'Requerido').max(20),
  name: z.string().min(1, 'Requerido'),
  email: z.string().email('Email inválido'),
  address: z.string().optional(),
});

type NewClientValues = z.infer<typeof newClientSchema>;

const emptyValues = (idNumber: string): NewClientValues => ({
  idType: '05',
  idNumber,
  name: '',
  email: '',
  address: '',
});

/**
 * Create-a-client dialog shared by InvoiceForm and CreditNoteForm, so a buyer
 * with no saved client record yet doesn't force a detour to /clients.
 */
export function NewClientDialog({
  open,
  onOpenChange,
  onCreated,
  defaultIdNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (client: SavedClient) => void;
  defaultIdNumber?: string;
}) {
  const t = useTranslations('clients');
  const tIdTypes = useTranslations('invoiceForm.idTypes');
  const tCommon = useTranslations('common');

  const form = useForm<NewClientValues>({
    resolver: zodResolver(newClientSchema),
    defaultValues: emptyValues(defaultIdNumber ?? ''),
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(emptyValues(defaultIdNumber ?? ''));
    // Only re-seed when the dialog opens, not on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (data) => {
    const input = {
      idType: data.idType,
      idNumber: data.idNumber,
      name: data.name,
      email: data.email,
      address: data.address || undefined,
    };
    await createClientAction(input);
    onCreated({
      id: crypto.randomUUID(),
      idType: input.idType,
      idNumber: input.idNumber,
      name: input.name,
      email: input.email,
      address: input.address ?? null,
    });
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('form.idType')} *</Label>
              <Controller
                name="idType"
                control={form.control}
                render={({ field }) => (
                  <Select<string>
                    value={field.value}
                    onValueChange={(v: string | null) => field.onChange(v ?? '05')}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string | null) => {
                          const opt = CLIENT_ID_TYPES.find((o) => o.code === v);
                          return opt ? tIdTypes(opt.labelKey) : v;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-auto min-w-(--anchor-width)">
                      {CLIENT_ID_TYPES.map((opt) => (
                        <SelectItem key={opt.code} value={opt.code}>
                          {tIdTypes(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('form.idNumber')} *</Label>
              <Input {...form.register('idNumber')} maxLength={20} aria-invalid={!!errors.idNumber} />
              {errors.idNumber && <p className="text-xs text-destructive">{errors.idNumber.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('form.name')} *</Label>
            <Input {...form.register('name')} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t('form.email')} *</Label>
            <Input type="email" {...form.register('email')} aria-invalid={!!errors.email} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t('form.address')}</Label>
            <Input {...form.register('address')} />
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {tCommon('cancel')}
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {tCommon('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
