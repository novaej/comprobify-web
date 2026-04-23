'use client';

import { useState, useTransition } from 'react';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Trash2, Plus } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createInvoiceAction, type InvoiceFormData } from '@/app/actions/invoice';
import { Link } from '@/i18n/navigation';

// ── Zod schema ────────────────────────────────────────────────────────────────

const TAX_OPTIONS = ['2-4', '2-0', '2-5', '2-6', '2-7'] as const;
const ID_TYPES = ['04', '05', '06', '07', '08'] as const;
const PAYMENT_METHODS = ['01', '15', '16', '17', '18', '19', '20', '21'] as const;

const decimalString = z.string().regex(/^\d+(\.\d{1,6})?$/, 'Número inválido');

const invoiceSchema = z.object({
  buyer: z.object({
    idType: z.enum(ID_TYPES),
    id: z.string().min(1, 'Requerido'),
    name: z.string().min(1, 'Requerido'),
    email: z.string().email('Email inválido'),
    address: z.string().optional(),
  }),
  items: z.array(
    z.object({
      mainCode: z.string().min(1, 'Requerido'),
      description: z.string().min(1, 'Requerido'),
      quantity: decimalString,
      unitPrice: decimalString,
      discount: z.string().optional(),
      taxOption: z.enum(TAX_OPTIONS),
    })
  ).min(1),
  payments: z.array(
    z.object({
      method: z.enum(PAYMENT_METHODS),
      total: decimalString,
      term: z.string().optional(),
    })
  ).min(1),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

// ── Totals ────────────────────────────────────────────────────────────────────

function computeTotals(items: InvoiceFormValues['items']) {
  let subtotal = 0;
  let taxableBase15 = 0;
  let iva = 0;

  for (const item of items) {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    const discPct = parseFloat(item.discount || '0') || 0;
    const lineNet = qty * price * (1 - discPct / 100);

    subtotal += lineNet;
    if (item.taxOption === '2-4') {
      taxableBase15 += lineNet;
      iva += lineNet * 0.15;
    } else if (item.taxOption === '2-5') {
      iva += lineNet * 0.05;
    }
  }

  return {
    subtotal: subtotal.toFixed(2),
    taxableBase: taxableBase15.toFixed(2),
    iva: iva.toFixed(2),
    total: (subtotal + iva).toFixed(2),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoiceForm() {
  const t = useTranslations('invoiceForm');
  const tError = useTranslations('apiError');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      buyer: { idType: '04', id: '', name: '', email: '', address: '' },
      items: [{ mainCode: '', description: '', quantity: '1', unitPrice: '0.00', discount: '', taxOption: '2-4' }],
      payments: [{ method: '01', total: '0.00', term: '' }],
    },
  });

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const watchedItems = useWatch({ control: form.control, name: 'items' });
  const totals = computeTotals(watchedItems ?? []);

  const onSubmit = form.handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const payload: InvoiceFormData = {
        buyer: {
          idType: data.buyer.idType,
          id: data.buyer.id,
          name: data.buyer.name,
          email: data.buyer.email,
          address: data.buyer.address || undefined,
        },
        items: data.items.map((item) => ({
          mainCode: item.mainCode,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount || undefined,
          taxOption: item.taxOption,
        })),
        payments: data.payments.map((p) => ({
          method: p.method,
          total: p.total,
          term: p.term || undefined,
        })),
      };
      const result = await createInvoiceAction(payload);
      if (result?.error) {
        setServerError(result.error);
      }
    });
  });

  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Buyer */}
      <Card>
        <CardHeader>
          <CardTitle>{t('buyer.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('buyer.idType')}</Label>
            <Controller
              name="buyer.idType"
              control={form.control}
              render={({ field }) => (
                <Select<string>
                  value={field.value}
                  onValueChange={(v: string | null) => field.onChange(v ?? '04')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ID_TYPES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {t(`idTypes.${code}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('buyer.id')}</Label>
            <Input {...form.register('buyer.id')} aria-invalid={!!errors.buyer?.id} />
            {errors.buyer?.id && <p className="text-xs text-destructive">{errors.buyer.id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t('buyer.name')}</Label>
            <Input {...form.register('buyer.name')} aria-invalid={!!errors.buyer?.name} />
            {errors.buyer?.name && <p className="text-xs text-destructive">{errors.buyer.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>{t('buyer.email')}</Label>
            <Input type="email" {...form.register('buyer.email')} aria-invalid={!!errors.buyer?.email} />
            {errors.buyer?.email && <p className="text-xs text-destructive">{errors.buyer.email.message}</p>}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('buyer.address')}</Label>
            <Input {...form.register('buyer.address')} />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle>{t('items.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {itemFields.map((field, index) => (
            <div key={field.id} className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t('items.mainCode')}</Label>
                  <Input {...form.register(`items.${index}.mainCode`)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('items.description')}</Label>
                  <Input {...form.register(`items.${index}.description`)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('items.quantity')}</Label>
                  <Input {...form.register(`items.${index}.quantity`)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('items.unitPrice')}</Label>
                  <Input {...form.register(`items.${index}.unitPrice`)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('items.discount')}</Label>
                  <Input {...form.register(`items.${index}.discount`)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('items.tax')}</Label>
                  <Controller
                    name={`items.${index}.taxOption`}
                    control={form.control}
                    render={({ field: f }) => (
                      <Select<string>
                        value={f.value}
                        onValueChange={(v: string | null) => f.onChange(v ?? '2-4')}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TAX_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {t(`taxOptions.${opt}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              {itemFields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  {t('items.remove')}
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendItem({ mainCode: '', description: '', quantity: '1', unitPrice: '0.00', discount: '', taxOption: '2-4' })
            }
          >
            <Plus className="mr-1 h-3 w-3" />
            {t('items.add')}
          </Button>
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardHeader>
          <CardTitle>{t('payment.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t('payment.method')}</Label>
            <Controller
              name="payments.0.method"
              control={form.control}
              render={({ field }) => (
                <Select<string>
                  value={field.value}
                  onValueChange={(v: string | null) => field.onChange(v ?? '01')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((code) => (
                      <SelectItem key={code} value={code}>
                        {t(`paymentMethods.${code}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('payment.total')}</Label>
            <Input {...form.register('payments.0.total')} placeholder={totals.total} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('payment.term')}</Label>
            <Input {...form.register('payments.0.term')} placeholder="0" />
          </div>
        </CardContent>
      </Card>

      {/* Totals summary */}
      <Card>
        <CardHeader>
          <CardTitle>{t('totals.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('totals.subtotal')}</span>
            <span className="font-mono">${totals.subtotal}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('totals.taxableBase')}</span>
            <span className="font-mono">${totals.taxableBase}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('totals.iva')}</span>
            <span className="font-mono">${totals.iva}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>{t('totals.total')}</span>
            <span className="font-mono">${totals.total}</span>
          </div>
        </CardContent>
      </Card>

      {serverError && (
        <p className="text-sm text-destructive">
          {tError.has(serverError as Parameters<typeof tError>[0])
            ? tError(serverError as Parameters<typeof tError>[0])
            : serverError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? t('submitting') : t('submit')}
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
          {tCommon('back')}
        </Link>
      </div>
    </form>
  );
}
