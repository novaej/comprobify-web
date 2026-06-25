'use client';

import { useState, useTransition, useMemo } from 'react';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Trash2, Plus, Search, Send, ClipboardSignature, Hammer, Loader2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductSearch } from '@/components/product-search';
import {
  createCreditNoteAction,
  rebuildCreditNoteAction,
  searchCreditableInvoicesAction,
  getInvoiceForCreditNoteAction,
  type CreditNoteFormData,
  type CreditableInvoiceSummary,
} from '@/app/actions/credit-note';
import type { CreateCreditNotePayload } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import type { CreditNoteCatalogs } from '@/app/[locale]/credit-notes/new/page';
import type { BackTargetKey } from '@/lib/back-targets';
import { toastApiError } from '@/lib/api-error-toast';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const IVA_RATE_CODES = ['4', '5', '0', '6', '7'] as const;
type IvaRateCode = typeof IVA_RATE_CODES[number];
type TaxOption = `2-${IvaRateCode}`;

const CONSUMIDOR_FINAL_CODE = '07';
const CONSUMIDOR_FINAL_ID = '9999999999999';

// ── Zod schema ────────────────────────────────────────────────────────────────

const decimalString = z.string().regex(/^\d+(\.\d{1,6})?$/, 'Número inválido');

const creditNoteSchema = z.object({
  buyer: z.object({
    idType: z.string().min(2),
    id: z.string().min(1, 'Requerido'),
    name: z.string().min(1, 'Requerido'),
    email: z.string().email('Email inválido'),
    address: z.string().optional(),
  }),
  originalDocument: z.object({
    documentType: z.string().min(2, 'Seleccione un comprobante').max(2),
    number: z.string().regex(/^\d{3}-\d{3}-\d{9}$/, 'Seleccione un comprobante'),
    issueDate: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, 'Seleccione un comprobante'),
  }),
  motivo: z.string().min(1, 'Requerido').max(300),
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
  additionalInfo: z
    .array(z.object({ name: z.string().min(1, 'Requerido'), value: z.string().min(1, 'Requerido') }))
    .optional(),
});

type CreditNoteFormValues = z.infer<typeof creditNoteSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDDMMYYYY(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

const BLANK_ITEM = { mainCode: '', auxCode: '', description: '', quantity: '1', unitPrice: '0.00', discount: '0.00', taxOption: '2-4' as TaxOption };
const BLANK_ORIGINAL_DOCUMENT = { documentType: '', number: '', issueDate: '' };

function toCreditNoteFormData(data: CreditNoteFormValues): CreditNoteFormData {
  return {
    buyer: {
      idType: data.buyer.idType,
      id: data.buyer.id,
      name: data.buyer.name,
      email: data.buyer.email,
      address: data.buyer.address || undefined,
    },
    originalDocument: data.originalDocument,
    motivo: data.motivo,
    items: data.items.map((item) => ({
      mainCode: item.mainCode,
      auxCode: item.auxCode || undefined,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount || undefined,
      taxOption: item.taxOption as TaxOption,
    })),
    additionalInfo: data.additionalInfo?.filter((i) => i.name && i.value) ?? [],
  };
}

// Inverse of buildCreditNotePayload (src/app/actions/credit-note.ts) — converts a
// credit note's requestPayload back into form values, to pre-fill the rebuild form.
function requestPayloadToFormValues(payload: CreateCreditNotePayload): CreditNoteFormValues {
  return {
    buyer: {
      idType: payload.buyer.idType,
      id: payload.buyer.id,
      name: payload.buyer.name,
      email: payload.buyer.email,
      address: payload.buyer.address ?? '',
    },
    originalDocument: payload.originalDocument,
    motivo: payload.motivo,
    items: payload.items.map((item) => ({
      mainCode: item.mainCode,
      auxCode: item.auxCode ?? '',
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount ?? '',
      taxOption: `${item.taxes[0].code}-${item.taxes[0].rateCode}`,
    })),
    additionalInfo: payload.additionalInfo ?? [],
  };
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

function computeTotals(items: CreditNoteFormValues['items']): Totals {
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

function TotalsRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">${value.toFixed(2)}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface RebuildSource {
  accessKey: string;
  payload: CreateCreditNotePayload;
  issueDate: string;
}

interface Props {
  catalogs: CreditNoteCatalogs;
  defaultValues?: Partial<CreditNoteFormValues>;
  initialOriginalAccessKey?: string;
  initialOriginalTotal?: string;
  initialRemaining?: string;
  rebuildFrom?: RebuildSource;
  backHref: string;
  from?: BackTargetKey;
}

export function CreditNoteForm({
  catalogs,
  defaultValues,
  initialOriginalAccessKey,
  initialOriginalTotal,
  initialRemaining,
  rebuildFrom,
  backHref,
  from,
}: Props) {
  const t = useTranslations('creditNoteForm');
  const tError = useTranslations('apiError');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isRebuild = Boolean(rebuildFrom);

  const ivaRates = useMemo(
    () =>
      catalogs.taxRates
        .filter((r) => r.taxCode === '2' && (IVA_RATE_CODES as readonly string[]).includes(r.rateCode))
        .sort((a, b) => IVA_RATE_CODES.indexOf(a.rateCode as IvaRateCode) - IVA_RATE_CODES.indexOf(b.rateCode as IvaRateCode)),
    [catalogs.taxRates]
  );

  const defaultTaxOption: string = ivaRates[0] ? `2-${ivaRates[0].rateCode}` : '2-4';
  const rebuildDefaultValues = rebuildFrom ? requestPayloadToFormValues(rebuildFrom.payload) : undefined;

  const form = useForm<CreditNoteFormValues>({
    resolver: zodResolver(creditNoteSchema),
    defaultValues: rebuildDefaultValues ?? {
      buyer: { idType: '05', id: '', name: '', email: '', address: '' },
      originalDocument: BLANK_ORIGINAL_DOCUMENT,
      motivo: '',
      items: [{ ...BLANK_ITEM, taxOption: defaultTaxOption as TaxOption }],
      additionalInfo: [],
      ...defaultValues,
    },
  });

  const { fields: itemFields, append: appendItem, remove: removeItem, replace: replaceItems } = useFieldArray({ control: form.control, name: 'items' });
  const { fields: infoFields, append: appendInfo, remove: removeInfo } = useFieldArray({ control: form.control, name: 'additionalInfo' });

  const watchedItems = useWatch({ control: form.control, name: 'items' });
  const watchedIdType = useWatch({ control: form.control, name: 'buyer.idType' });
  const watchedOriginalDocument = useWatch({ control: form.control, name: 'originalDocument' });
  const totals = computeTotals(watchedItems ?? []);
  const hasOriginalDocument = Boolean(watchedOriginalDocument?.number);
  // The buyer must match the original invoice's buyer once one is selected — only
  // legal-identity fields are locked; address/email stay editable (delivery details).
  const buyerLocked = hasOriginalDocument;

  // ── Original document search dialog ─────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CreditableInvoiceSummary[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const [isApplying, startApplyTransition] = useTransition();
  const [originalAccessKey, setOriginalAccessKey] = useState<string | undefined>(initialOriginalAccessKey);
  const [originalTotal, setOriginalTotal] = useState<string | undefined>(initialOriginalTotal);
  const [remaining, setRemaining] = useState<string | undefined>(initialRemaining);
  const exceedsRemaining = remaining !== undefined && totals.total > parseFloat(remaining) + 0.005;

  function runSearch() {
    startSearchTransition(async () => {
      const result = await searchCreditableInvoicesAction(searchQuery);
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      setSearchResults(result.results);
    });
  }

  function selectOriginalDocument(accessKey: string) {
    startApplyTransition(async () => {
      const result = await getInvoiceForCreditNoteAction(accessKey);
      if ('error' in result) {
        toastApiError(result.error, tError);
        return;
      }
      form.setValue('originalDocument', result.data.originalDocument, { shouldValidate: true });
      form.setValue('buyer.idType', result.data.buyer.idType);
      form.setValue('buyer.id', result.data.buyer.id);
      form.setValue('buyer.name', result.data.buyer.name, { shouldValidate: true });
      form.setValue('buyer.email', result.data.buyer.email, { shouldValidate: true });
      replaceItems(result.data.items.length > 0 ? result.data.items : [{ ...BLANK_ITEM, taxOption: defaultTaxOption as TaxOption }]);
      setOriginalAccessKey(result.data.originalAccessKey);
      setOriginalTotal(result.data.originalTotal);
      setRemaining(result.data.remaining);
      setSearchOpen(false);
    });
  }

  const [pendingPayload, setPendingPayload] = useState<CreditNoteFormData | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitIntent, setSubmitIntent] = useState<'sign' | 'signAndSend'>('signAndSend');

  const openConfirmSignAndSend = form.handleSubmit((data) => {
    setSubmitIntent('signAndSend');
    setPendingPayload(toCreditNoteFormData(data));
    setConfirmOpen(true);
  });

  const openConfirmSignOnly = form.handleSubmit((data) => {
    setSubmitIntent('sign');
    setPendingPayload(toCreditNoteFormData(data));
    setConfirmOpen(true);
  });

  function handleConfirmedSubmit() {
    if (!pendingPayload) return;
    setConfirmOpen(false);
    setServerError(null);
    startTransition(async () => {
      const result = rebuildFrom
        ? await rebuildCreditNoteAction(rebuildFrom.accessKey, pendingPayload, originalAccessKey, submitIntent === 'signAndSend', from)
        : await createCreditNoteAction(pendingPayload, originalAccessKey, submitIntent === 'signAndSend', from);
      if (result?.error) {
        setServerError(result.error);
        setPendingPayload(null);
      }
    });
  }

  const onSubmit = openConfirmSignAndSend;
  const { errors } = form.formState;

  const dialogCopy = isRebuild
    ? submitIntent === 'sign'
      ? { title: t('confirmRebuildSignOnly.title'), description: t('confirmRebuildSignOnly.description'), cancel: t('confirmRebuildSignOnly.cancel'), submit: t('confirmRebuildSignOnly.submit') }
      : { title: t('confirmRebuild.title'), description: t('confirmRebuild.description'), cancel: t('confirmRebuild.cancel'), submit: t('confirmRebuild.submit') }
    : submitIntent === 'sign'
      ? { title: t('confirmSignOnly.title'), description: t('confirmSignOnly.description'), cancel: t('confirmSignOnly.cancel'), submit: t('confirmSignOnly.submit') }
      : { title: t('confirm.title'), description: t('confirm.description'), cancel: t('confirm.cancel'), submit: t('confirm.submit') };

  return (
    <>
    <form onSubmit={onSubmit} className="space-y-6">

      {/* Header */}
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">{t('issueDate')}</Label>
            <Input value={rebuildFrom?.issueDate ?? todayDDMMYYYY()} readOnly className="bg-muted text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      {/* Original document */}
      <Card>
        <CardHeader>
          <CardTitle>{t('originalDocument.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {watchedOriginalDocument?.number ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-medium">{watchedOriginalDocument.number}</p>
                <p className="text-xs text-muted-foreground">{watchedOriginalDocument.issueDate}</p>
                {originalTotal && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('originalDocument.total')}: <span className="font-mono font-medium">${originalTotal}</span>
                  </p>
                )}
                {remaining !== undefined && (
                  <p className={cn('text-xs', exceedsRemaining ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                    {t('originalDocument.remaining')}: <span className="font-mono font-medium">${remaining}</span>
                  </p>
                )}
              </div>
              {!isRebuild && (
                <Button type="button" variant="outline" size="sm" onClick={() => setSearchOpen(true)} disabled={isApplying}>
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  {t('originalDocument.change')}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm text-muted-foreground">{t('originalDocument.empty')}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setSearchOpen(true)} disabled={isApplying}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {t('originalDocument.search')}
              </Button>
            </div>
          )}
          {errors.originalDocument?.number && (
            <p className="text-xs text-destructive">{t('originalDocument.required')}</p>
          )}
          <p className="text-xs text-muted-foreground">{t('originalDocument.hint')}</p>
        </CardContent>
      </Card>

      {/* Buyer */}
      <Card>
        <CardHeader>
          <CardTitle>{t('buyer.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {buyerLocked && (
            <p className="text-xs text-muted-foreground sm:col-span-2">{t('buyer.lockedHint')}</p>
          )}
          <div className="space-y-1.5">
            <Label>{t('buyer.idType')} *</Label>
            <Controller
              name="buyer.idType"
              control={form.control}
              render={({ field }) => (
                <Select<string> value={field.value} onValueChange={(v: string | null) => field.onChange(v ?? '05')} disabled={buyerLocked}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: string | null) => catalogs.idTypes.find((idT) => idT.code === v)?.description ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="w-auto min-w-(--anchor-width)">
                    {catalogs.idTypes.map((idType) => (
                      <SelectItem key={idType.code} value={idType.code}>{idType.description}</SelectItem>
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
                readOnly={buyerLocked || watchedIdType === CONSUMIDOR_FINAL_CODE}
                className={buyerLocked || watchedIdType === CONSUMIDOR_FINAL_CODE ? 'bg-muted text-muted-foreground' : ''}
                aria-invalid={!!errors.buyer?.id}
              />
              {!buyerLocked && watchedIdType !== CONSUMIDOR_FINAL_CODE && catalogs.clients.length > 0 && (
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
            <Input
              {...form.register('buyer.name')}
              readOnly={buyerLocked}
              className={buyerLocked ? 'bg-muted text-muted-foreground' : ''}
              aria-invalid={!!errors.buyer?.name}
            />
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
                            <Select<string> value={f.value} onValueChange={(v: string | null) => f.onChange(v ?? defaultTaxOption)}>
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
                                  return <SelectItem key={r.rateCode} value={`2-${r.rateCode}`}>{label}</SelectItem>;
                                })}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <Input {...form.register(`items.${index}.discount`)} className="h-8 w-20" placeholder="0.00" />
                      </td>
                      <td className="py-2 pr-2 font-mono text-sm whitespace-nowrap">${fmt(qty * price - disc)}</td>
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
            onClick={() => appendItem({ ...BLANK_ITEM, taxOption: defaultTaxOption as TaxOption })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('items.add')}
          </Button>
        </CardContent>
      </Card>

      {/* Motivo + Totals */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('motivo.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Textarea {...form.register('motivo')} maxLength={300} rows={4} placeholder={t('motivo.placeholder')} aria-invalid={!!errors.motivo} />
            {errors.motivo && <p className="text-xs text-destructive">{errors.motivo.message}</p>}
          </CardContent>
        </Card>

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
                    <td colSpan={3} className="py-4 text-center text-sm text-muted-foreground">{t('additionalInfo.empty')}</td>
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

      {exceedsRemaining && (
        <p className="text-sm text-destructive">{t('originalDocument.exceedsRemaining', { remaining: remaining ?? '0.00' })}</p>
      )}

      {serverError && (
        <p className="text-sm text-destructive">
          {tError.has(serverError as Parameters<typeof tError>[0]) ? tError(serverError as Parameters<typeof tError>[0]) : serverError}
        </p>
      )}

      <div className="flex flex-wrap gap-3 pb-6">
        <Button type="submit" disabled={isPending || !hasOriginalDocument || exceedsRemaining}>
          {isPending && submitIntent === 'signAndSend'
            ? isRebuild ? t('submittingRebuild') : t('submitting')
            : isRebuild ? t('submitRebuild') : t('submit')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !hasOriginalDocument || exceedsRemaining}
          onClick={openConfirmSignOnly}
        >
          {isPending && submitIntent === 'sign'
            ? isRebuild ? t('signingOnlyRebuild') : t('signingOnly')
            : isRebuild ? t('signOnlyRebuild') : t('signOnly')}
        </Button>
        <Link href={backHref} className={buttonVariants({ variant: 'outline' })}>
          {tCommon('back')}
        </Link>
      </div>
    </form>

    <Dialog open={confirmOpen} onOpenChange={(open) => { setConfirmOpen(open); if (!open) setPendingPayload(null); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{dialogCopy.title}</DialogTitle>
          <DialogDescription>{dialogCopy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{dialogCopy.cancel}</DialogClose>
          <Button onClick={handleConfirmedSubmit}>
            {isRebuild ? <Hammer className="mr-2 h-4 w-4" /> : submitIntent === 'sign' ? <ClipboardSignature className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
            {dialogCopy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Search original document */}
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('originalDocument.search')}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
            placeholder={t('originalDocument.searchPlaceholder')}
            autoFocus
          />
          <Button type="button" onClick={runSearch} disabled={isSearching}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('originalDocument.searchEmpty')}</p>
          ) : (
            searchResults.map((doc) => (
              <button
                key={doc.accessKey}
                type="button"
                disabled={isApplying}
                className="flex w-full flex-col rounded-md border p-3 text-left hover:bg-muted disabled:opacity-50"
                onClick={() => selectOriginalDocument(doc.accessKey)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-medium">{doc.sequential}</span>
                  <span className="font-mono text-sm">${doc.total}</span>
                </div>
                <span className="truncate text-xs text-muted-foreground">{doc.buyerName} · {doc.issueDate}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
