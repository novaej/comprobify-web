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
import { createProductAction, type CatalogProduct } from '@/app/actions/catalog';

const IVA_OPTIONS = [
  { value: '2-4', labelKey: '2-4' as const },
  { value: '2-5', labelKey: '2-5' as const },
  { value: '2-0', labelKey: '2-0' as const },
  { value: '2-6', labelKey: '2-6' as const },
  { value: '2-7', labelKey: '2-7' as const },
] as const;

const newProductSchema = z.object({
  mainCode: z.string().min(1, 'Requerido').max(25),
  auxCode: z.string().max(25).optional(),
  description: z.string().min(1, 'Requerido'),
  unitPrice: z.string().regex(/^\d+(\.\d{1,6})?$/, 'Número inválido'),
  taxOption: z.string().min(3),
});

type NewProductValues = z.infer<typeof newProductSchema>;

const emptyValues = (mainCode: string): NewProductValues => ({
  mainCode,
  auxCode: '',
  description: '',
  unitPrice: '0.00',
  taxOption: '2-4',
});

/**
 * Create-a-product dialog shared by InvoiceForm and CreditNoteForm's item
 * rows, so a product with no catalog entry yet doesn't force a detour to /catalog.
 */
export function NewProductDialog({
  open,
  onOpenChange,
  onCreated,
  defaultMainCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (product: CatalogProduct) => void;
  defaultMainCode?: string;
}) {
  const t = useTranslations('catalog');
  const tTax = useTranslations('invoiceForm.taxOptions');
  const tCommon = useTranslations('common');

  const form = useForm<NewProductValues>({
    resolver: zodResolver(newProductSchema),
    defaultValues: emptyValues(defaultMainCode ?? ''),
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset(emptyValues(defaultMainCode ?? ''));
    // Only re-seed when the dialog opens, not on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit(async (data) => {
    const input = {
      mainCode: data.mainCode,
      auxCode: data.auxCode || undefined,
      description: data.description,
      unitPrice: data.unitPrice,
      taxOption: data.taxOption,
    };
    await createProductAction(input);
    onCreated({
      id: crypto.randomUUID(),
      mainCode: input.mainCode,
      auxCode: input.auxCode ?? null,
      description: input.description,
      unitPrice: input.unitPrice,
      taxOption: input.taxOption,
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
              <Label>{t('form.mainCode')} *</Label>
              <Input {...form.register('mainCode')} maxLength={25} aria-invalid={!!errors.mainCode} />
              {errors.mainCode
                ? <p className="text-xs text-destructive">{errors.mainCode.message}</p>
                : <p className="text-xs text-muted-foreground">{t('form.mainCodeHint')}</p>
              }
            </div>
            <div className="space-y-1.5">
              <Label>{t('form.auxCode')}</Label>
              <Input {...form.register('auxCode')} maxLength={25} />
              <p className="text-xs text-muted-foreground">{t('form.auxCodeHint')}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('form.description')} *</Label>
            <Input {...form.register('description')} aria-invalid={!!errors.description} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('form.unitPrice')} *</Label>
              <Input {...form.register('unitPrice')} placeholder="0.00" aria-invalid={!!errors.unitPrice} />
              {errors.unitPrice && <p className="text-xs text-destructive">{errors.unitPrice.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>{t('form.taxOption')} *</Label>
              <Controller
                name="taxOption"
                control={form.control}
                render={({ field }) => (
                  <Select<string>
                    value={field.value}
                    onValueChange={(v: string | null) => field.onChange(v ?? '2-4')}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: string | null) => {
                          const opt = IVA_OPTIONS.find((o) => o.value === v);
                          return opt ? tTax(opt.labelKey) : v;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-auto min-w-(--anchor-width)">
                      {IVA_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {tTax(opt.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
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
