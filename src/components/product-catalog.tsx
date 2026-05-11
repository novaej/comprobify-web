'use client';

import { useState, useTransition, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Plus, Pencil, Trash2 } from 'lucide-react';
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
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  type CatalogProduct,
  type CatalogProductInput,
  createProductAction,
  updateProductAction,
  deleteProductAction,
} from '@/app/actions/catalog';

// ── Constants ─────────────────────────────────────────────────────────────────

const IVA_OPTIONS = [
  { value: '2-4', labelKey: '2-4' as const },
  { value: '2-5', labelKey: '2-5' as const },
  { value: '2-0', labelKey: '2-0' as const },
  { value: '2-6', labelKey: '2-6' as const },
  { value: '2-7', labelKey: '2-7' as const },
] as const;

// ── Schema ────────────────────────────────────────────────────────────────────

const productSchema = z.object({
  mainCode: z.string().min(1, 'Requerido').max(25),
  auxCode: z.string().max(25).optional(),
  description: z.string().min(1, 'Requerido'),
  unitPrice: z.string().regex(/^\d+(\.\d{1,6})?$/, 'Número inválido'),
  taxOption: z.string().min(3),
});

type ProductFormValues = z.infer<typeof productSchema>;

// ── Sub-components ────────────────────────────────────────────────────────────

function ProductForm({
  defaultValues,
  onSubmit,
  isPending,
}: {
  defaultValues?: ProductFormValues;
  onSubmit: (data: ProductFormValues) => void;
  isPending: boolean;
}) {
  const t = useTranslations('catalog');
  const tTax = useTranslations('invoiceForm.taxOptions');
  const tCommon = useTranslations('common');

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: defaultValues ?? {
      mainCode: '',
      auxCode: '',
      description: '',
      unitPrice: '0.00',
      taxOption: '2-4',
    },
  });

  const { errors } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
        <Button type="submit" disabled={isPending}>
          {isPending ? '...' : tCommon('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProductCatalog({ initialProducts }: { initialProducts: CatalogProduct[] }) {
  const t = useTranslations('catalog');
  const tTax = useTranslations('invoiceForm.taxOptions');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CatalogProduct | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogProduct | null>(null);

  const openAdd = () => { setEditTarget(null); setFormOpen(true); };
  const openEdit = (p: CatalogProduct) => { setEditTarget(p); setFormOpen(true); };

  const handleFormSubmit = (data: ProductFormValues) => {
    const input: CatalogProductInput = {
      mainCode: data.mainCode,
      auxCode: data.auxCode || undefined,
      description: data.description,
      unitPrice: data.unitPrice,
      taxOption: data.taxOption,
    };
    startTransition(async () => {
      if (editTarget) {
        await updateProductAction(editTarget.id, input);
      } else {
        await createProductAction(input);
      }
      setFormOpen(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      await deleteProductAction(id);
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const taxLabel = (taxOption: string) => {
    const opt = IVA_OPTIONS.find((o) => o.value === taxOption);
    return opt ? tTax(opt.labelKey) : taxOption;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openAdd} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          {t('add')}
        </Button>
      </div>

      {initialProducts.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('table.mainCode')}</th>
                <th className="px-4 py-2.5 font-medium">{t('table.auxCode')}</th>
                <th className="px-4 py-2.5 font-medium">{t('table.description')}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t('table.unitPrice')}</th>
                <th className="px-4 py-2.5 font-medium">{t('table.taxOption')}</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {initialProducts.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-xs">{p.mainCode}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{p.auxCode ?? '—'}</td>
                  <td className="px-4 py-2.5">{p.description}</td>
                  <td className="px-4 py-2.5 text-right font-mono">${Number(p.unitPrice).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{taxLabel(p.taxOption)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">{t('edit')}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">{t('delete')}</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? t('edit') : t('add')}
            </DialogTitle>
          </DialogHeader>
          <ProductForm
            key={editTarget?.id ?? 'new'}
            defaultValues={editTarget ? {
              mainCode: editTarget.mainCode,
              auxCode: editTarget.auxCode ?? '',
              description: editTarget.description,
              unitPrice: Number(editTarget.unitPrice).toFixed(2),
              taxOption: editTarget.taxOption,
            } : undefined}
            onSubmit={handleFormSubmit}
            isPending={isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('confirmDeleteTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('confirmDeleteDescription')}</p>
          {deleteTarget && (
            <p className="text-sm font-medium">{deleteTarget.mainCode} — {deleteTarget.description}</p>
          )}
          <DialogFooter>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
