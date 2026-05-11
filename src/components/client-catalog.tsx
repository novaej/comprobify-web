'use client';

import { useState, useTransition } from 'react';
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
  type SavedClient,
  type ClientInput,
  createClientAction,
  updateClientAction,
  deleteClientAction,
} from '@/app/actions/clients';

// Consumidor Final excluded — not a real client
const CLIENT_ID_TYPES = [
  { code: '04', labelKey: '04' as const },
  { code: '05', labelKey: '05' as const },
  { code: '06', labelKey: '06' as const },
  { code: '08', labelKey: '08' as const },
] as const;

const clientSchema = z.object({
  idType: z.string().min(2),
  idNumber: z.string().min(1, 'Requerido').max(20),
  name: z.string().min(1, 'Requerido'),
  email: z.string().email('Email inválido'),
  address: z.string().optional(),
});

type ClientFormValues = z.infer<typeof clientSchema>;

function ClientForm({
  defaultValues,
  onSubmit,
  isPending,
}: {
  defaultValues?: ClientFormValues;
  onSubmit: (data: ClientFormValues) => void;
  isPending: boolean;
}) {
  const t = useTranslations('clients');
  const tIdTypes = useTranslations('invoiceForm.idTypes');
  const tCommon = useTranslations('common');

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: defaultValues ?? {
      idType: '05',
      idNumber: '',
      name: '',
      email: '',
      address: '',
    },
  });

  const { errors } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
        <Button type="submit" disabled={isPending}>
          {isPending ? '...' : tCommon('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ClientCatalog({ initialClients }: { initialClients: SavedClient[] }) {
  const t = useTranslations('clients');
  const tIdTypes = useTranslations('invoiceForm.idTypes');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SavedClient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedClient | null>(null);

  const openAdd = () => { setEditTarget(null); setFormOpen(true); };
  const openEdit = (c: SavedClient) => { setEditTarget(c); setFormOpen(true); };

  const handleFormSubmit = (data: ClientFormValues) => {
    const input: ClientInput = {
      idType: data.idType,
      idNumber: data.idNumber,
      name: data.name,
      email: data.email,
      address: data.address || undefined,
    };
    startTransition(async () => {
      if (editTarget) {
        await updateClientAction(editTarget.id, input);
      } else {
        await createClientAction(input);
      }
      setFormOpen(false);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      await deleteClientAction(id);
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const idTypeLabel = (code: string) => {
    const opt = CLIENT_ID_TYPES.find((o) => o.code === code);
    return opt ? tIdTypes(opt.labelKey) : code;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openAdd} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          {t('add')}
        </Button>
      </div>

      {initialClients.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('table.idType')}</th>
                <th className="px-4 py-2.5 font-medium">{t('table.idNumber')}</th>
                <th className="px-4 py-2.5 font-medium">{t('table.name')}</th>
                <th className="px-4 py-2.5 font-medium">{t('table.email')}</th>
                <th className="px-4 py-2.5 font-medium">{t('table.address')}</th>
                <th className="px-4 py-2.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {initialClients.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{idTypeLabel(c.idType)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{c.idNumber}</td>
                  <td className="px-4 py-2.5">{c.name}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.email}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.address ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">{t('edit')}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(c)}
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
            <DialogTitle>{editTarget ? t('edit') : t('add')}</DialogTitle>
          </DialogHeader>
          <ClientForm
            key={editTarget?.id ?? 'new'}
            defaultValues={editTarget ? {
              idType: editTarget.idType,
              idNumber: editTarget.idNumber,
              name: editTarget.name,
              email: editTarget.email,
              address: editTarget.address ?? '',
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
            <p className="text-sm font-medium">{deleteTarget.idNumber} — {deleteTarget.name}</p>
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
