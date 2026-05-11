'use client';

import { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Trash2, Plus, Search } from 'lucide-react';
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
import type { InvoiceCatalogs } from '@/app/[locale]/invoices/new/page';
import type { CatalogProduct } from '@/app/actions/catalog';
import type { SavedClient } from '@/app/actions/clients';

// ── Constants ─────────────────────────────────────────────────────────────────

// IVA rate codes we expose (tax code 2, active SRI codes in preferred order)
const IVA_RATE_CODES = ['4', '5', '0', '6', '7'] as const;
type IvaRateCode = typeof IVA_RATE_CODES[number];
type TaxOption = `2-${IvaRateCode}`;

const CONSUMIDOR_FINAL_CODE = '07';
const CONSUMIDOR_FINAL_ID = '9999999999999';

// ── Zod schema ────────────────────────────────────────────────────────────────

const decimalString = z.string().regex(/^\d+(\.\d{1,6})?$/, 'Número inválido');

const invoiceSchema = z.object({
  guiaRemision: z
    .string()
    .regex(/^\d{3}-\d{3}-\d{9}$/, 'Formato: NNN-NNN-NNNNNNNNN')
    .optional()
    .or(z.literal('')),
  buyer: z.object({
    idType: z.string().min(2),
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
        taxOption: z.string().min(3),
      })
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: z.string().min(2),
        total: decimalString,
        term: z.string().optional(),
        termUnit: z.string().max(10).optional(),
      })
    )
    .min(1),
  additionalInfo: z
    .array(z.object({ name: z.string().min(1, 'Requerido'), value: z.string().min(1, 'Requerido') }))
    .optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

interface Totals {
  subtotalNoTax: number;
  taxable15: number;
  taxable5: number;
  subtotal0: number;
  subtotalNoObj: number;
  subtotalExempt: number;
  totalDiscount: number;
  iva15: number;
  iva5: number;
  total: number;
}

function computeTotals(items: InvoiceFormValues['items']): Totals {
  let subtotalNoTax = 0, taxable15 = 0, taxable5 = 0;
  let subtotal0 = 0, subtotalNoObj = 0, subtotalExempt = 0, totalDiscount = 0;

  for (const item of items) {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    const disc = parseFloat(item.discount || '0') || 0;
    const lineNet = qty * price - disc;
    subtotalNoTax += lineNet;
    totalDiscount += disc;
    if (item.taxOption === '2-4') taxable15 += lineNet;
    else if (item.taxOption === '2-5') taxable5 += lineNet;
    else if (item.taxOption === '2-0') subtotal0 += lineNet;
    else if (item.taxOption === '2-6') subtotalNoObj += lineNet;
    else if (item.taxOption === '2-7') subtotalExempt += lineNet;
  }

  const iva15 = taxable15 * 0.15;
  const iva5 = taxable5 * 0.05;
  return { subtotalNoTax, taxable15, taxable5, subtotal0, subtotalNoObj, subtotalExempt, totalDiscount, iva15, iva5, total: subtotalNoTax + iva15 + iva5 };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ProductSearch({
  value,
  onChange,
  onSelect,
  products,
  className,
  'aria-invalid': ariaInvalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (p: CatalogProduct) => void;
  products: CatalogProduct[];
  className?: string;
  'aria-invalid'?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePos = () => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left });
    }
  };

  const filtered = value.trim().length > 0
    ? products
        .filter(
          (p) =>
            p.mainCode.toLowerCase().includes(value.toLowerCase()) ||
            p.description.toLowerCase().includes(value.toLowerCase()),
        )
        .slice(0, 7)
    : [];

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); updatePos(); setOpen(true); }}
        onFocus={() => { updatePos(); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={className}
        aria-invalid={ariaInvalid}
      />
      {open && filtered.length > 0 && pos && createPortal(
        <div
          className="fixed z-50 min-w-[220px] rounded-md border bg-popover shadow-md"
          style={{ top: pos.top, left: pos.left }}
        >
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted"
              onMouseDown={() => { onSelect(p); setOpen(false); }}
            >
              <span className="font-mono text-xs font-medium">{p.mainCode}</span>
              <span className="truncate text-xs text-muted-foreground">{p.description}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">${value.toFixed(2)}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  catalogs: InvoiceCatalogs;
  defaultValues?: Partial<InvoiceFormValues>;
}

export function InvoiceForm({ catalogs, defaultValues }: Props) {
  const t = useTranslations('invoiceForm');
  const tError = useTranslations('apiError');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  // Filter to IVA rates (tax code 2) in preferred display order
  const ivaRates = useMemo(
    () =>
      catalogs.taxRates
        .filter((r) => r.taxCode === '2' && (IVA_RATE_CODES as readonly string[]).includes(r.rateCode))
        .sort((a, b) => IVA_RATE_CODES.indexOf(a.rateCode as IvaRateCode) - IVA_RATE_CODES.indexOf(b.rateCode as IvaRateCode)),
    [catalogs.taxRates]
  );

  const defaultTaxOption: string = ivaRates[0] ? `2-${ivaRates[0].rateCode}` : '2-4';

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: defaultValues ?? {
      guiaRemision: '',
      buyer: { idType: '05', id: '', name: '', email: '', address: '' },
      items: [{ mainCode: '', auxCode: '', description: '', quantity: '1', unitPrice: '0.00', discount: '0.00', taxOption: defaultTaxOption }],
      payments: [{ method: '01', total: '0.00', term: '', termUnit: '' }],
      additionalInfo: [],
    },
  });

  const { fields: itemFields, append: appendItem, remove: removeItem } = useFieldArray({ control: form.control, name: 'items' });
  const { fields: paymentFields, append: appendPayment, remove: removePayment } = useFieldArray({ control: form.control, name: 'payments' });
  const { fields: infoFields, append: appendInfo, remove: removeInfo } = useFieldArray({ control: form.control, name: 'additionalInfo' });

  const watchedItems = useWatch({ control: form.control, name: 'items' });
  const watchedPayments = useWatch({ control: form.control, name: 'payments' });
  const watchedIdType = useWatch({ control: form.control, name: 'buyer.idType' });
  const totals = computeTotals(watchedItems ?? []);
  const singlePayment = paymentFields.length === 1;

  // Auto-fill Consumidor Final ID when that type is selected
  useEffect(() => {
    if (watchedIdType === CONSUMIDOR_FINAL_CODE) {
      form.setValue('buyer.id', CONSUMIDOR_FINAL_ID, { shouldValidate: true });
    }
  }, [watchedIdType, form]);

  // Auto-sync single payment total to computed invoice total
  useEffect(() => {
    if (singlePayment) {
      const rounded = fmt(totals.total);
      if (watchedPayments?.[0]?.total !== rounded) {
        form.setValue('payments.0.total', rounded, { shouldValidate: false });
      }
    }
  }, [totals.total, singlePayment, watchedPayments, form]);

  // Quick-add: if single $0.00 payment exists, change its method; otherwise append
  const addQuickPayment = (method: string) => {
    if (singlePayment && (watchedPayments?.[0]?.total === '0.00' || !watchedPayments?.[0]?.total)) {
      form.setValue('payments.0.method', method);
    } else {
      appendPayment({ method, total: '0.00', term: '', termUnit: '' });
    }
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
          taxOption: item.taxOption as TaxOption,
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
      if (result?.error) setServerError(result.error);
    });
  });

  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} className="space-y-6">

      {/* Invoice header */}
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">{t('issueDate')}</Label>
            <Input value={todayDDMMYYYY()} readOnly className="bg-muted text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('guiaRemision')}</Label>
            <Input {...form.register('guiaRemision')} placeholder={t('guiaRemisionPlaceholder')} />
            {errors.guiaRemision && <p className="text-xs text-destructive">{errors.guiaRemision.message}</p>}
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
                  onValueChange={(v: string | null) => field.onChange(v ?? '05')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) => catalogs.idTypes.find((t) => t.code === v)?.description ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="w-auto min-w-(--anchor-width)">
                    {catalogs.idTypes.map((idType) => (
                      <SelectItem key={idType.code} value={idType.code}>
                        {idType.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('buyer.id')} *</Label>
            <div className="flex gap-1">
              <Input
                {...form.register('buyer.id')}
                readOnly={watchedIdType === CONSUMIDOR_FINAL_CODE}
                className={watchedIdType === CONSUMIDOR_FINAL_CODE ? 'bg-muted text-muted-foreground' : ''}
                aria-invalid={!!errors.buyer?.id}
              />
              {watchedIdType !== CONSUMIDOR_FINAL_CODE && catalogs.clients.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('buyer.searchClient')}
                  onClick={() => {
                    const idValue = form.getValues('buyer.id').trim();
                    const match = catalogs.clients.find((c) => c.idNumber === idValue);
                    if (match) {
                      form.setValue('buyer.idType', match.idType);
                      form.setValue('buyer.name', match.name, { shouldValidate: true });
                      form.setValue('buyer.email', match.email, { shouldValidate: true });
                      form.setValue('buyer.address', match.address ?? '');
                    }
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}
            </div>
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
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-2 font-medium">{t('items.mainCode')}</th>
                      <th className="pb-2 pr-2 font-medium">{t('items.auxCode')}</th>
                      <th className="pb-2 pr-2 font-medium">{t('items.quantity')}</th>
                      <th className="pb-2 pr-2 font-medium">{t('items.description')}</th>
                      <th className="pb-2 pr-2 font-medium">{t('items.unitPrice')}</th>
                      <th className="pb-2 pr-2 font-medium">{t('items.tax')}</th>
                      <th className="pb-2 pr-2 font-medium">{t('items.discount')} $</th>
                      <th className="pb-2 pr-2 font-medium">{t('items.lineTotal')}</th>
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemFields.map((field, index) => {
                      const qty = parseFloat(watchedItems?.[index]?.quantity || '0') || 0;
                      const price = parseFloat(watchedItems?.[index]?.unitPrice || '0') || 0;
                      const disc = parseFloat(watchedItems?.[index]?.discount || '0') || 0;
                      return (
                        <tr key={field.id} className="border-b last:border-0">
                          <td className="py-2 pr-2">
                            <ProductSearch
                              value={watchedItems?.[index]?.mainCode ?? ''}
                              onChange={(v) => form.setValue(`items.${index}.mainCode`, v, { shouldValidate: true })}
                              onSelect={(p) => {
                                form.setValue(`items.${index}.mainCode`, p.mainCode, { shouldValidate: true });
                                form.setValue(`items.${index}.auxCode`, p.auxCode ?? '');
                                form.setValue(`items.${index}.description`, p.description, { shouldValidate: true });
                                form.setValue(`items.${index}.unitPrice`, Number(p.unitPrice).toFixed(2), { shouldValidate: true });
                                form.setValue(`items.${index}.taxOption`, p.taxOption);
                              }}
                              products={catalogs.products}
                              className="h-8 w-24"
                              aria-invalid={!!errors.items?.[index]?.mainCode}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Input {...form.register(`items.${index}.auxCode`)} className="h-8 w-20" />
                          </td>
                          <td className="py-2 pr-2">
                            <Input {...form.register(`items.${index}.quantity`)} className="h-8 w-16" />
                          </td>
                          <td className="py-2 pr-2">
                            <Input {...form.register(`items.${index}.description`)} className="h-8 min-w-[140px]" aria-invalid={!!errors.items?.[index]?.description} />
                          </td>
                          <td className="py-2 pr-2">
                            <Input {...form.register(`items.${index}.unitPrice`)} className="h-8 w-24" />
                          </td>
                          <td className="py-2 pr-2">
                            <Controller
                              name={`items.${index}.taxOption`}
                              control={form.control}
                              render={({ field: f }) => (
                                <Select<string>
                                  value={f.value}
                                  onValueChange={(v: string | null) => f.onChange(v ?? defaultTaxOption)}
                                >
                                  <SelectTrigger className="h-8 w-32">
                                    <SelectValue>
                                      {(v: string | null) => {
                                        const r = ivaRates.find((x) => `2-${x.rateCode}` === v);
                                        if (!r) return v;
                                        return Number(r.rate) > 0 ? `IVA ${fmt(Number(r.rate))}%` : r.description;
                                      }}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent className="w-auto min-w-(--anchor-width)">
                                    {ivaRates.map((r) => {
                                      const label = Number(r.rate) > 0 ? `IVA ${fmt(Number(r.rate))}%` : r.description;
                                      return (
                                        <SelectItem key={r.rateCode} value={`2-${r.rateCode}`}>
                                          {label}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Input {...form.register(`items.${index}.discount`)} className="h-8 w-20" placeholder="0.00" />
                          </td>
                          <td className="py-2 pr-2 font-mono text-sm whitespace-nowrap">
                            ${fmt(qty * price - disc)}
                          </td>
                          <td className="py-2">
                            {itemFields.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeItem(index)}>
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
                onClick={() => appendItem({ mainCode: '', auxCode: '', description: '', quantity: '1', unitPrice: '0.00', discount: '0.00', taxOption: defaultTaxOption })}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t('items.add')}
              </Button>
            </CardContent>
          </Card>

      {/* Payments + Totals — equal columns */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Payment methods */}
        <Card>
          <CardHeader>
            <CardTitle>{t('payment.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-2 font-medium">{t('payment.method')}</th>
                    <th className="pb-2 pr-2 font-medium">{t('payment.total')}</th>
                    <th className="pb-2 pr-2 font-medium">{t('payment.term')}</th>
                    <th className="pb-2 pr-2 font-medium">{t('payment.termUnit')}</th>
                    <th className="pb-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
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
                                <SelectValue>
                                  {(v: string | null) => catalogs.paymentMethods.find((m) => m.code === v)?.description ?? v}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent className="w-auto min-w-(--anchor-width)">
                                {catalogs.paymentMethods.map((m) => (
                                  <SelectItem key={m.code} value={m.code}>
                                    {m.description}
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
                          readOnly={singlePayment}
                          className={`h-8 w-24 ${singlePayment ? 'bg-muted text-muted-foreground' : ''}`}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input {...form.register(`payments.${index}.term`)} className="h-8 w-14" placeholder="0" />
                      </td>
                      <td className="py-2 pr-2">
                        <Input {...form.register(`payments.${index}.termUnit`)} className="h-8 w-16" placeholder="dias" />
                      </td>
                      <td className="py-2">
                        {paymentFields.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removePayment(index)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['01', '16', '19'] as const).map((code) => {
                const label = catalogs.paymentMethods.find((m) => m.code === code)?.description ?? code;
                return (
                  <Button key={code} type="button" variant="outline" size="sm" onClick={() => addQuickPayment(code)}>
                    {label}
                  </Button>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => appendPayment({ method: '01', total: '0.00', term: '', termUnit: '' })}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t('payment.add')}
              </Button>
            </div>

            {singlePayment && (
              <p className="text-xs text-muted-foreground">{t('payment.autoSync')}</p>
            )}
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardHeader>
            <CardTitle>{t('totals.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <TotalsRow label={t('totals.subtotalNoTax')} value={totals.subtotalNoTax} />
            <TotalsRow label={t('totals.subtotal15')} value={totals.taxable15} />
            <TotalsRow label={t('totals.subtotal5')} value={totals.taxable5} />
            <TotalsRow label={t('totals.subtotal0')} value={totals.subtotal0} />
            <TotalsRow label={t('totals.subtotalNoObj')} value={totals.subtotalNoObj} />
            <TotalsRow label={t('totals.subtotalExempt')} value={totals.subtotalExempt} />
            <TotalsRow label={t('totals.totalDiscount')} value={totals.totalDiscount} />
            <TotalsRow label={t('totals.iva15')} value={totals.iva15} />
            <TotalsRow label={t('totals.iva5')} value={totals.iva5} />
            <Separator />
            <div className="flex justify-between pt-0.5 font-semibold">
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
            <table className="w-full min-w-[340px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2 font-medium">{t('additionalInfo.name')}</th>
                  <th className="pb-2 pr-2 font-medium">{t('additionalInfo.value')}</th>
                  <th className="pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {infoFields.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-sm text-muted-foreground">
                      {t('additionalInfo.empty')}
                    </td>
                  </tr>
                )}
                {infoFields.map((field, index) => (
                  <tr key={field.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <Input {...form.register(`additionalInfo.${index}.name`)} className="h-8" aria-invalid={!!errors.additionalInfo?.[index]?.name} />
                    </td>
                    <td className="py-2 pr-2">
                      <Input {...form.register(`additionalInfo.${index}.value`)} className="h-8" aria-invalid={!!errors.additionalInfo?.[index]?.value} />
                    </td>
                    <td className="py-2">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeInfo(index)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => appendInfo({ name: '', value: '' })}>
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

      <div className="flex gap-3 pb-6">
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
