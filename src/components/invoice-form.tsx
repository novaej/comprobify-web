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

// ── Constants ─────────────────────────────────────────────────────────────────

const TAX_OPTIONS = ['2-4', '2-0', '2-5', '2-6', '2-7'] as const;
const ID_TYPES = ['04', '05', '06', '07', '08'] as const;
const PAYMENT_METHODS = ['01', '15', '16', '17', '18', '19', '20', '21'] as const;

const decimalString = z.string().regex(/^\d+(\.\d{1,6})?$/, 'Número inválido');

// ── Zod schema ────────────────────────────────────────────────────────────────

const invoiceSchema = z.object({
  guiaRemision: z
    .string()
    .regex(/^\d{3}-\d{3}-\d{9}$/, 'Formato: NNN-NNN-NNNNNNNNN')
    .optional()
    .or(z.literal('')),
  buyer: z.object({
    idType: z.enum(ID_TYPES),
    id: z.string().min(1, 'Requerido'),
    name: z.string().min(1, 'Requerido'),
    email: z.string().email('Email inválido'),
    address: z.string().optional(),
  }),
  items: z
    .array(
      z.object({
        mainCode: z.string().min(1, 'Requerido'),
        auxCode: z.string().optional(),
        description: z.string().min(1, 'Requerido'),
        quantity: decimalString,
        unitPrice: decimalString,
        discount: z.string().optional(),
        taxOption: z.enum(TAX_OPTIONS),
      })
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        total: decimalString,
        term: z.string().optional(),
        termUnit: z.string().max(10).optional(),
      })
    )
    .min(1),
  additionalInfo: z
    .array(
      z.object({
        name: z.string().min(1, 'Requerido'),
        value: z.string().min(1, 'Requerido'),
      })
    )
    .optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmt(n: number) {
  return n.toFixed(2);
}

function computeTotals(items: InvoiceFormValues['items']) {
  let subtotalNoTax = 0;
  let taxable15 = 0;
  let taxable5 = 0;
  let subtotal0 = 0;
  let subtotalNoObj = 0;
  let subtotalExempt = 0;
  let totalDiscount = 0;

  for (const item of items) {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    const disc = parseFloat(item.discount || '0') || 0;
    const lineNet = qty * price - disc;

    subtotalNoTax += lineNet;
    totalDiscount += disc;

    switch (item.taxOption) {
      case '2-4': taxable15 += lineNet; break;
      case '2-5': taxable5 += lineNet; break;
      case '2-0': subtotal0 += lineNet; break;
      case '2-6': subtotalNoObj += lineNet; break;
      case '2-7': subtotalExempt += lineNet; break;
    }
  }

  const iva15 = taxable15 * 0.15;
  const iva5 = taxable5 * 0.05;
  const total = subtotalNoTax + iva15 + iva5;

  return { subtotalNoTax, taxable15, taxable5, subtotal0, subtotalNoObj, subtotalExempt, totalDiscount, iva15, iva5, total };
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
      guiaRemision: '',
      buyer: { idType: '04', id: '', name: '', email: '', address: '' },
      items: [{ mainCode: '', auxCode: '', description: '', quantity: '1', unitPrice: '0.00', discount: '0.00', taxOption: '2-4' }],
      payments: [{ method: '01', total: '0.00', term: '', termUnit: '' }],
      additionalInfo: [],
    },
  });

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({ control: form.control, name: 'items' });
  const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({ control: form.control, name: 'payments' });
  const { fields: infoFields, append: appendInfo, remove: removeInfo } = useFieldArray({ control: form.control, name: 'additionalInfo' });

  const watchedItems = useWatch({ control: form.control, name: 'items' });
  const totals = computeTotals(watchedItems ?? []);

  const addQuickPayment = (method: typeof PAYMENT_METHODS[number]) => {
    appendPayment({ method, total: '0.00', term: '', termUnit: '' });
  };

  const onSubmit = form.handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const payload: InvoiceFormData = {
        guiaRemision: data.guiaRemision || undefined,
        buyer: {
          idType: data.buyer.idType,
          id: data.buyer.id,
          name: data.buyer.name,
          email: data.buyer.email,
          address: data.buyer.address || undefined,
        },
        items: data.items.map((item) => ({
          mainCode: item.mainCode,
          auxCode: item.auxCode || undefined,
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
          termUnit: p.termUnit || undefined,
        })),
        additionalInfo: data.additionalInfo?.filter((i) => i.name && i.value) ?? [],
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

      {/* Invoice header */}
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('issueDate')}</Label>
            <Input value={todayDDMMYYYY()} readOnly className="bg-muted" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('guiaRemision')}</Label>
            <Input
              {...form.register('guiaRemision')}
              placeholder={t('guiaRemisionPlaceholder')}
            />
            {errors.guiaRemision && (
              <p className="text-xs text-destructive">{errors.guiaRemision.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Buyer */}
      <Card>
        <CardHeader>
          <CardTitle>{t('buyer.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('buyer.idType')} *</Label>
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
            <Label>{t('buyer.id')} *</Label>
            <Input {...form.register('buyer.id')} aria-invalid={!!errors.buyer?.id} />
            {errors.buyer?.id && <p className="text-xs text-destructive">{errors.buyer.id.message}</p>}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('buyer.name')} *</Label>
            <Input {...form.register('buyer.name')} aria-invalid={!!errors.buyer?.name} />
            {errors.buyer?.name && <p className="text-xs text-destructive">{errors.buyer.name.message}</p>}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('buyer.address')}</Label>
            <Input {...form.register('buyer.address')} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('buyer.email')} *</Label>
            <Input type="email" {...form.register('buyer.email')} aria-invalid={!!errors.buyer?.email} />
            {errors.buyer?.email && <p className="text-xs text-destructive">{errors.buyer.email.message}</p>}
            <p className="text-xs text-muted-foreground">{t('buyer.emailHint')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle>{t('items.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">{t('items.mainCode')}</th>
                  <th className="pb-2 pr-2 font-medium">{t('items.auxCode')}</th>
                  <th className="pb-2 pr-2 font-medium">{t('items.quantity')}</th>
                  <th className="pb-2 pr-2 font-medium">{t('items.description')}</th>
                  <th className="pb-2 pr-2 font-medium">{t('items.unitPrice')}</th>
                  <th className="pb-2 pr-2 font-medium">{t('items.tax')}</th>
                  <th className="pb-2 pr-2 font-medium">{t('items.discount')}</th>
                  <th className="pb-2 pr-2 font-medium">{t('items.lineTotal')}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {itemFields.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-4 text-center text-muted-foreground">
                      {t('items.empty')}
                    </td>
                  </tr>
                )}
                {itemFields.map((field, index) => {
                  const qty = parseFloat(watchedItems?.[index]?.quantity || '0') || 0;
                  const price = parseFloat(watchedItems?.[index]?.unitPrice || '0') || 0;
                  const disc = parseFloat(watchedItems?.[index]?.discount || '0') || 0;
                  const lineTotal = qty * price - disc;

                  return (
                    <tr key={field.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <Input
                          {...form.register(`items.${index}.mainCode`)}
                          className="h-8 w-24"
                          aria-invalid={!!errors.items?.[index]?.mainCode}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          {...form.register(`items.${index}.auxCode`)}
                          className="h-8 w-24"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          {...form.register(`items.${index}.quantity`)}
                          className="h-8 w-20"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          {...form.register(`items.${index}.description`)}
                          className="h-8 min-w-[160px]"
                          aria-invalid={!!errors.items?.[index]?.description}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          {...form.register(`items.${index}.unitPrice`)}
                          className="h-8 w-24"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Controller
                          name={`items.${index}.taxOption`}
                          control={form.control}
                          render={({ field: f }) => (
                            <Select<string>
                              value={f.value}
                              onValueChange={(v: string | null) => f.onChange(v ?? '2-4')}
                            >
                              <SelectTrigger className="h-8 w-32">
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
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          {...form.register(`items.${index}.discount`)}
                          className="h-8 w-20"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="py-2 pr-2 font-mono text-sm whitespace-nowrap">
                        ${fmt(lineTotal)}
                      </td>
                      <td className="py-2">
                        {itemFields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendItem({ mainCode: '', auxCode: '', description: '', quantity: '1', unitPrice: '0.00', discount: '0.00', taxOption: '2-4' })
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('items.add')}
          </Button>
        </CardContent>
      </Card>

      {/* Payments + Totals side by side on large screens */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Payments */}
        <Card>
          <CardHeader>
            <CardTitle>{t('payment.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-2 font-medium">{t('payment.method')}</th>
                    <th className="pb-2 pr-2 font-medium">{t('payment.total')}</th>
                    <th className="pb-2 pr-2 font-medium">{t('payment.term')}</th>
                    <th className="pb-2 pr-2 font-medium">{t('payment.termUnit')}</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {paymentFields.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-muted-foreground">
                        {t('payment.empty')}
                      </td>
                    </tr>
                  )}
                  {paymentFields.map((field, index) => (
                    <tr key={field.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <Controller
                          name={`payments.${index}.method`}
                          control={form.control}
                          render={({ field: f }) => (
                            <Select<string>
                              value={f.value}
                              onValueChange={(v: string | null) => f.onChange(v ?? '01')}
                            >
                              <SelectTrigger className="h-8 w-40">
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
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          {...form.register(`payments.${index}.total`)}
                          className="h-8 w-24"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          {...form.register(`payments.${index}.term`)}
                          className="h-8 w-16"
                          placeholder="0"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input
                          {...form.register(`payments.${index}.termUnit`)}
                          className="h-8 w-20"
                          placeholder="dias"
                        />
                      </td>
                      <td className="py-2">
                        {paymentFields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removePayment(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addQuickPayment('01')}>
                {t('payment.quickCash')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addQuickPayment('16')}>
                {t('payment.quickDebit')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addQuickPayment('19')}>
                {t('payment.quickCredit')}
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendPayment({ method: '01', total: '0.00', term: '', termUnit: '' })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('payment.add')}
            </Button>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardHeader>
            <CardTitle>{t('totals.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totals.subtotalNoTax')}</span>
              <span className="font-mono">${fmt(totals.subtotalNoTax)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totals.subtotal15')}</span>
              <span className="font-mono">${fmt(totals.taxable15)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totals.subtotal5')}</span>
              <span className="font-mono">${fmt(totals.taxable5)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totals.subtotal0')}</span>
              <span className="font-mono">${fmt(totals.subtotal0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totals.subtotalNoObj')}</span>
              <span className="font-mono">${fmt(totals.subtotalNoObj)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totals.subtotalExempt')}</span>
              <span className="font-mono">${fmt(totals.subtotalExempt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totals.totalDiscount')}</span>
              <span className="font-mono">${fmt(totals.totalDiscount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totals.iva15')}</span>
              <span className="font-mono">${fmt(totals.iva15)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('totals.iva5')}</span>
              <span className="font-mono">${fmt(totals.iva5)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>{t('totals.total')}</span>
              <span className="font-mono">${fmt(totals.total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional info */}
      <Card>
        <CardHeader>
          <CardTitle>{t('additionalInfo.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">{t('additionalInfo.name')}</th>
                  <th className="pb-2 pr-2 font-medium">{t('additionalInfo.value')}</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {infoFields.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-muted-foreground">
                      {t('additionalInfo.empty')}
                    </td>
                  </tr>
                )}
                {infoFields.map((field, index) => (
                  <tr key={field.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <Input
                        {...form.register(`additionalInfo.${index}.name`)}
                        className="h-8"
                        aria-invalid={!!errors.additionalInfo?.[index]?.name}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        {...form.register(`additionalInfo.${index}.value`)}
                        className="h-8"
                        aria-invalid={!!errors.additionalInfo?.[index]?.value}
                      />
                    </td>
                    <td className="py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeInfo(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendInfo({ name: '', value: '' })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('additionalInfo.add')}
          </Button>
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
