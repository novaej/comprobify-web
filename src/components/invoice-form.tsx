'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useForm, useFieldArray, useWatch, Controller, type UseFormReturn, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Trash2, Plus, Search, UserPlus, PackagePlus, Send, FolderOpen, Save, ClipboardSignature, Hammer, Building2, AlertTriangle } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
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
import { createInvoiceAction, rebuildInvoiceAction, type InvoiceFormData } from '@/app/actions/invoice';
import type { CreateInvoicePayload, CatalogTaxRate } from '@/lib/api';
import { ProductSearch } from '@/components/product-search';
import type { CatalogProduct } from '@/app/actions/catalog';
import {
  saveInvoiceTemplateAction,
  deleteInvoiceTemplateAction,
  type SavedDocumentTemplate,
} from '@/app/actions/templates';
import { Link } from '@/i18n/navigation';
import type { InvoiceCatalogs } from '@/app/[locale]/invoices/new/page';
import type { SavedClient } from '@/app/actions/clients';
import { NewClientDialog } from '@/components/new-client-dialog';
import { NewProductDialog } from '@/components/new-product-dialog';
import type { BackTargetKey } from '@/lib/back-targets';

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
        // SRI detallesAdicionales — up to 3 free-form name/value pairs per line item.
        additionalDetails: z
          .array(
            z.object({
              name: z.string().min(1, 'Requerido').max(300),
              value: z.string().min(1, 'Requerido').max(300),
            })
          )
          .max(3)
          .optional(),
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

function toInvoiceFormData(data: InvoiceFormValues): InvoiceFormData {
  return {
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
      additionalDetails: item.additionalDetails?.filter((d) => d.name && d.value) ?? [],
    })),
    payments: data.payments.map((p) => ({
      method: p.method,
      total: p.total,
      term: p.term || undefined,
      termUnit: p.termUnit || undefined,
    })),
    additionalInfo: data.additionalInfo?.filter((i) => i.name && i.value) ?? [],
  };
}

function templateToFormValues(data: InvoiceFormData): InvoiceFormValues {
  return {
    guiaRemision: data.guiaRemision ?? '',
    buyer: {
      idType: data.buyer.idType,
      id: data.buyer.id,
      name: data.buyer.name,
      email: data.buyer.email,
      address: data.buyer.address ?? '',
    },
    items: data.items.map((item) => ({
      mainCode: item.mainCode,
      auxCode: item.auxCode ?? '',
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount ?? '',
      taxOption: item.taxOption,
      additionalDetails: item.additionalDetails ?? [],
    })),
    payments: data.payments.map((p) => ({
      method: p.method,
      total: p.total,
      term: p.term ?? '',
      termUnit: p.termUnit ?? '',
    })),
    additionalInfo: data.additionalInfo ?? [],
  };
}

// Inverse of buildCreateDocumentPayload (src/app/actions/invoice.ts) — converts a
// document's requestPayload (the exact body it was created/last rebuilt with) back
// into form values, to pre-fill the rebuild form. Each item only ever has one tax
// entry (see buildCreateDocumentPayload), so taxOption is recovered directly from it.
function requestPayloadToFormValues(payload: CreateInvoicePayload): InvoiceFormValues {
  return {
    guiaRemision: payload.guiaRemision ?? '',
    buyer: {
      idType: payload.buyer.idType,
      id: payload.buyer.id,
      name: payload.buyer.name,
      email: payload.buyer.email,
      address: payload.buyer.address ?? '',
    },
    items: payload.items.map((item) => ({
      mainCode: item.mainCode,
      auxCode: item.auxCode ?? '',
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount ?? '',
      taxOption: `${item.taxes[0].code}-${item.taxes[0].rateCode}`,
      additionalDetails: item.additionalDetails ?? [],
    })),
    payments: payload.payments.map((p) => ({
      method: p.method,
      total: p.total,
      term: p.term !== undefined ? String(p.term) : '',
      termUnit: p.termUnit ?? '',
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

function TotalsRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">${value.toFixed(2)}</span>
    </div>
  );
}

// Item row + its optional expandable "additional details" panel (SRI
// detallesAdicionales, up to 3 name/value pairs per line item). Split out of the
// items table's .map() because each row needs its own nested useFieldArray, which
// can only be called from its own component (rules of hooks).
const ITEM_TABLE_COLUMNS = 10;

function ItemRow({
  form,
  index,
  item,
  errors,
  ivaRates,
  defaultTaxOption,
  products,
  onRequestNewProduct,
  canRemove,
  onRemove,
  t,
}: {
  form: UseFormReturn<InvoiceFormValues>;
  index: number;
  item: InvoiceFormValues['items'][number] | undefined;
  errors: FieldErrors<InvoiceFormValues>;
  ivaRates: CatalogTaxRate[];
  defaultTaxOption: string;
  products: CatalogProduct[];
  onRequestNewProduct: () => void;
  canRemove: boolean;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const { fields: detailFields, append: appendDetail, remove: removeDetail, replace: replaceDetails } = useFieldArray({
    control: form.control,
    name: `items.${index}.additionalDetails`,
  });
  const [showDetails, setShowDetails] = useState(detailFields.length > 0);

  const qty = parseFloat(item?.quantity || '0') || 0;
  const price = parseFloat(item?.unitPrice || '0') || 0;
  const disc = parseFloat(item?.discount || '0') || 0;

  return (
    <>
      <tr className="border-b last:border-0">
        <td className="py-2 pr-2">
          <div className="flex gap-1">
            <ProductSearch
              value={item?.mainCode ?? ''}
              onChange={(v) => form.setValue(`items.${index}.mainCode`, v, { shouldValidate: true })}
              onSelect={(p) => {
                form.setValue(`items.${index}.mainCode`, p.mainCode, { shouldValidate: true });
                form.setValue(`items.${index}.auxCode`, p.auxCode ?? '');
                form.setValue(`items.${index}.description`, p.description, { shouldValidate: true });
                form.setValue(`items.${index}.unitPrice`, Number(p.unitPrice).toFixed(2), { shouldValidate: true });
                form.setValue(`items.${index}.taxOption`, p.taxOption);
              }}
              products={products}
              className="h-8 w-20"
              aria-invalid={!!errors.items?.[index]?.mainCode}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label={t('items.newProduct')}
              onClick={onRequestNewProduct}
            >
              <PackagePlus className="h-3.5 w-3.5" />
            </Button>
          </div>
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
        <td className="py-2 pr-2">
          <Switch
            size="sm"
            checked={showDetails}
            onCheckedChange={(checked) => {
              setShowDetails(checked);
              if (checked && detailFields.length === 0) {
                appendDetail({ name: '', value: '' });
              } else if (!checked) {
                replaceDetails([]);
              }
            }}
            aria-label={t('items.additionalDetails.toggle')}
          />
        </td>
        <td className="py-2">
          {canRemove && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </td>
      </tr>
      {showDetails && (
        <tr className="border-b bg-muted/30 last:border-0">
          <td colSpan={ITEM_TABLE_COLUMNS} className="px-2 py-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('items.additionalDetails.title')} ({detailFields.length}/3)
                </p>
                {detailFields.length < 3 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => appendDetail({ name: '', value: '' })}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t('items.additionalDetails.add')}
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {detailFields.map((field, detailIndex) => (
                  <div key={field.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      {...form.register(`items.${index}.additionalDetails.${detailIndex}.name`)}
                      placeholder={t('items.additionalDetails.name')}
                      className="h-8 sm:flex-1"
                      maxLength={300}
                      aria-invalid={!!errors.items?.[index]?.additionalDetails?.[detailIndex]?.name}
                    />
                    <Input
                      {...form.register(`items.${index}.additionalDetails.${detailIndex}.value`)}
                      placeholder={t('items.additionalDetails.value')}
                      className="h-8 sm:flex-1"
                      maxLength={300}
                      aria-invalid={!!errors.items?.[index]?.additionalDetails?.[detailIndex]?.value}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() => removeDetail(detailIndex)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface RebuildSource {
  accessKey: string;
  payload: CreateInvoicePayload;
  issueDate: string;
}

interface IssuerInfo {
  businessName: string;
  tradeName: string | null;
  branchCode: string;
  issuePointCode: string;
}

interface Props {
  catalogs: InvoiceCatalogs;
  defaultValues?: Partial<InvoiceFormValues>;
  rebuildFrom?: RebuildSource;
  backHref: string;
  from?: BackTargetKey;
  issuer: IssuerInfo;
  canIssue: boolean;
}

export function InvoiceForm({ catalogs, defaultValues, rebuildFrom, backHref, from, issuer, canIssue }: Props) {
  const t = useTranslations('invoiceForm');
  const tError = useTranslations('apiError');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const isRebuild = Boolean(rebuildFrom);

  // Saved clients start from the page's server fetch but grow locally when a
  // new one is created from this form, without a full page refresh.
  const [clients, setClients] = useState<SavedClient[]>(catalogs.clients);
  const [newClientOpen, setNewClientOpen] = useState(false);

  // Same idea for the product catalog. One shared dialog for every item row;
  // newProductRowIndex tracks which row's fields to fill once a product is created.
  const [products, setProducts] = useState<CatalogProduct[]>(catalogs.products);
  const [newProductRowIndex, setNewProductRowIndex] = useState<number | null>(null);

  // Filter to IVA rates (tax code 2) in preferred display order
  const ivaRates = useMemo(
    () =>
      catalogs.taxRates
        .filter((r) => r.taxCode === '2' && (IVA_RATE_CODES as readonly string[]).includes(r.rateCode))
        .sort((a, b) => IVA_RATE_CODES.indexOf(a.rateCode as IvaRateCode) - IVA_RATE_CODES.indexOf(b.rateCode as IvaRateCode)),
    [catalogs.taxRates]
  );

  const defaultTaxOption: string = ivaRates[0] ? `2-${ivaRates[0].rateCode}` : '2-4';
  const rebuildDefaultValues = rebuildFrom ? requestPayloadToFormValues(rebuildFrom.payload) : undefined;

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: rebuildDefaultValues ?? defaultValues ?? {
      guiaRemision: '',
      buyer: { idType: '05', id: '', name: '', email: '', address: '' },
      items: [{ mainCode: '', auxCode: '', description: '', quantity: '1', unitPrice: '0.00', discount: '0.00', taxOption: defaultTaxOption, additionalDetails: [] }],
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

  const [pendingPayload, setPendingPayload] = useState<InvoiceFormData | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitIntent, setSubmitIntent] = useState<'sign' | 'signAndSend'>('signAndSend');

  const openConfirmSignAndSend = form.handleSubmit((data) => {
    if (!canIssue) return;
    setSubmitIntent('signAndSend');
    setPendingPayload(toInvoiceFormData(data));
    setConfirmOpen(true);
  });

  const openConfirmSignOnly = form.handleSubmit((data) => {
    if (!canIssue) return;
    setSubmitIntent('sign');
    setPendingPayload(toInvoiceFormData(data));
    setConfirmOpen(true);
  });

  // Templates: save current (validated) form as a reusable template, or load/delete a saved one.
  const router = useRouter();
  const [isTemplatePending, startTemplateTransition] = useTransition();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedDocumentTemplate | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingTemplateData, setPendingTemplateData] = useState<InvoiceFormData | null>(null);
  // Prefilled into the save dialog so re-saving a loaded template defaults to "update" rather than "new".
  const [loadedTemplateName, setLoadedTemplateName] = useState<string | null>(null);

  const existingTemplateMatch = catalogs.templates.find(
    (tpl) => tpl.name.trim().toLowerCase() === saveName.trim().toLowerCase()
  );

  const openSaveDialog = form.handleSubmit((data) => {
    setPendingTemplateData(toInvoiceFormData(data));
    setSaveName(loadedTemplateName ?? '');
    setSaveError(null);
    setSaveOpen(true);
  });

  function handleSaveTemplate() {
    if (!pendingTemplateData || !saveName.trim()) return;
    startTemplateTransition(async () => {
      const result = await saveInvoiceTemplateAction(saveName.trim(), pendingTemplateData);
      if (result?.error) {
        setSaveError(result.error);
      } else {
        setSaveOpen(false);
        router.refresh();
      }
    });
  }

  function handleLoadTemplate(tpl: SavedDocumentTemplate) {
    form.reset(templateToFormValues(tpl.data));
    setLoadedTemplateName(tpl.name);
    setTemplatesOpen(false);
  }

  function handleDeleteTemplate() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTemplateTransition(async () => {
      await deleteInvoiceTemplateAction(id);
      setDeleteTarget(null);
      router.refresh();
    });
  }

  function handleConfirmedSubmit() {
    if (!pendingPayload) return;
    setConfirmOpen(false);
    setServerError(null);
    startTransition(async () => {
      const result = rebuildFrom
        ? await rebuildInvoiceAction(rebuildFrom.accessKey, pendingPayload, submitIntent === 'signAndSend', from)
        : await createInvoiceAction(pendingPayload, submitIntent === 'signAndSend', from);
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
      ? {
          title: t('confirmRebuildSignOnly.title'),
          description: t('confirmRebuildSignOnly.description'),
          cancel: t('confirmRebuildSignOnly.cancel'),
          submit: t('confirmRebuildSignOnly.submit'),
        }
      : {
          title: t('confirmRebuild.title'),
          description: t('confirmRebuild.description'),
          cancel: t('confirmRebuild.cancel'),
          submit: t('confirmRebuild.submit'),
        }
    : submitIntent === 'sign'
      ? {
          title: t('confirmSignOnly.title'),
          description: t('confirmSignOnly.description'),
          cancel: t('confirmSignOnly.cancel'),
          submit: t('confirmSignOnly.submit'),
        }
      : {
          title: t('confirm.title'),
          description: t('confirm.description'),
          cancel: t('confirm.cancel'),
          submit: t('confirm.submit'),
        };

  return (
    <>
    <form onSubmit={onSubmit} className="space-y-6">

      {!canIssue && (
        <div
          className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{t('issuingPaused')}</span>
        </div>
      )}

      {/* Issuer + Templates */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium text-foreground">{issuer.tradeName ?? issuer.businessName}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{issuer.branchCode}-{issuer.issuePointCode}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {catalogs.templates.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              {t('templates.load')}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={openSaveDialog}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {t('templates.save')}
          </Button>
        </div>
      </div>

      {/* Invoice header */}
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-muted-foreground">{t('issueDate')}</Label>
            <Input
              value={rebuildFrom?.issueDate ?? todayDDMMYYYY()}
              readOnly
              className="bg-muted text-muted-foreground"
            />
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
              {watchedIdType !== CONSUMIDOR_FINAL_CODE && clients.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('buyer.searchClient')}
                  onClick={() => {
                    const idValue = form.getValues('buyer.id').trim();
                    const match = clients.find((c) => c.idNumber === idValue);
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
              {watchedIdType !== CONSUMIDOR_FINAL_CODE && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('buyer.newClient')}
                  onClick={() => setNewClientOpen(true)}
                >
                  <UserPlus className="h-4 w-4" />
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
                <table className="w-full min-w-[760px] text-sm">
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
                      <th className="pb-2 pr-2 font-medium">{t('items.additionalDetails.columnLabel')}</th>
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemFields.map((field, index) => (
                      <ItemRow
                        key={field.id}
                        form={form}
                        index={index}
                        item={watchedItems?.[index]}
                        errors={errors}
                        ivaRates={ivaRates}
                        defaultTaxOption={defaultTaxOption}
                        products={products}
                        onRequestNewProduct={() => setNewProductRowIndex(index)}
                        canRemove={itemFields.length > 1}
                        onRemove={() => removeItem(index)}
                        t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendItem({ mainCode: '', auxCode: '', description: '', quantity: '1', unitPrice: '0.00', discount: '0.00', taxOption: defaultTaxOption, additionalDetails: [] })}
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
                        <Controller
                          name={`payments.${index}.termUnit`}
                          control={form.control}
                          render={({ field: f }) => (
                            <Select<string>
                              value={f.value || null}
                              onValueChange={(v: string | null) => f.onChange(v ?? '')}
                            >
                              <SelectTrigger className="h-8 w-24">
                                <SelectValue>
                                  {(v: string | null) => v
                                    ? (catalogs.termUnits.find((u) => u.code === v)?.description ?? v)
                                    : <span className="text-muted-foreground">—</span>}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {catalogs.termUnits.map((u) => (
                                  <SelectItem key={u.code} value={u.code}>
                                    {u.description}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
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

      <div className="flex flex-wrap gap-3 pb-6">
        <Button type="submit" disabled={isPending || !canIssue}>
          {isPending && submitIntent === 'signAndSend'
            ? isRebuild ? t('submittingRebuild') : t('submitting')
            : isRebuild ? t('submitRebuild') : t('submit')}
        </Button>
        <Button type="button" variant="outline" disabled={isPending || !canIssue} onClick={openConfirmSignOnly}>
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
          <DialogClose render={<Button variant="outline" />}>
            {dialogCopy.cancel}
          </DialogClose>
          <Button onClick={handleConfirmedSubmit}>
            {isRebuild ? (
              <Hammer className="mr-2 h-4 w-4" />
            ) : submitIntent === 'sign' ? (
              <ClipboardSignature className="mr-2 h-4 w-4" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {dialogCopy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Load template — picker with buyer/items/total preview */}
    <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('templates.load')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {catalogs.templates.map((tpl) => {
            const previewTotals = computeTotals(tpl.data.items as InvoiceFormValues['items']);
            const itemsLabel = tpl.data.items.map((i) => i.description).join(', ');
            return (
              <div key={tpl.id} className="flex items-start justify-between gap-2 rounded-md border p-3">
                <button type="button" className="flex-1 text-left" onClick={() => handleLoadTemplate(tpl)}>
                  <p className="font-medium">{tpl.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{tpl.data.buyer.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{itemsLabel}</p>
                  <p className="font-mono text-xs">${fmt(previewTotals.total)}</p>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(tpl)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>

    {/* Delete template confirmation */}
    <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('templates.confirmDeleteTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('templates.confirmDeleteDescription')}</p>
        {deleteTarget && <p className="text-sm font-medium">{deleteTarget.name}</p>}
        <DialogFooter>
          <Button variant="destructive" onClick={handleDeleteTemplate} disabled={isTemplatePending}>
            {t('templates.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Save as template — name prompt */}
    <Dialog open={saveOpen} onOpenChange={(open) => { setSaveOpen(open); if (!open) setPendingTemplateData(null); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('templates.saveDialogTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>{t('templates.nameLabel')}</Label>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={t('templates.namePlaceholder')}
            autoFocus
          />
          {existingTemplateMatch && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {t('templates.overwriteWarning', { name: existingTemplateMatch.name })}
            </p>
          )}
          {saveError && (
            <p className="text-xs text-destructive">
              {tError.has(saveError as Parameters<typeof tError>[0]) ? tError(saveError as Parameters<typeof tError>[0]) : saveError}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {tCommon('cancel')}
          </DialogClose>
          <Button onClick={handleSaveTemplate} disabled={isTemplatePending || !saveName.trim()}>
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <NewClientDialog
      open={newClientOpen}
      onOpenChange={setNewClientOpen}
      defaultIdNumber={form.getValues('buyer.id')}
      onCreated={(client) => {
        setClients((prev) => [...prev, client]);
        form.setValue('buyer.idType', client.idType);
        form.setValue('buyer.id', client.idNumber, { shouldValidate: true });
        form.setValue('buyer.name', client.name, { shouldValidate: true });
        form.setValue('buyer.email', client.email, { shouldValidate: true });
        form.setValue('buyer.address', client.address ?? '');
      }}
    />

    <NewProductDialog
      open={newProductRowIndex !== null}
      onOpenChange={(open) => { if (!open) setNewProductRowIndex(null); }}
      defaultMainCode={newProductRowIndex !== null ? form.getValues(`items.${newProductRowIndex}.mainCode`) : undefined}
      onCreated={(product) => {
        setProducts((prev) => [...prev, product]);
        if (newProductRowIndex !== null) {
          form.setValue(`items.${newProductRowIndex}.mainCode`, product.mainCode, { shouldValidate: true });
          form.setValue(`items.${newProductRowIndex}.auxCode`, product.auxCode ?? '');
          form.setValue(`items.${newProductRowIndex}.description`, product.description, { shouldValidate: true });
          form.setValue(`items.${newProductRowIndex}.unitPrice`, Number(product.unitPrice).toFixed(2), { shouldValidate: true });
          form.setValue(`items.${newProductRowIndex}.taxOption`, product.taxOption);
        }
        setNewProductRowIndex(null);
      }}
    />
    </>
  );
}
