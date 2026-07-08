'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/api-error-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { publishAgreementAction, activateAgreementAction } from '@/app/actions/admin';
import { FileText, Plus, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import type { AdminAgreementVersion, AdminAgreementDetail, AgreementDocumentType } from '@/lib/admin-api';

const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' });

const TYPE_LABELS: Record<AgreementDocumentType, string> = {
  TERMS: 'Términos de Servicio',
  PRIVACY: 'Política de Privacidad',
  DPA: 'Acuerdo de Procesamiento de Datos',
};

interface TypeSectionProps {
  documentType: AgreementDocumentType;
  versions: AdminAgreementVersion[];
}

export function AdminAgreementManager({
  termVersions,
  privacyVersions,
  dpaVersions,
}: {
  termVersions: AdminAgreementVersion[];
  privacyVersions: AdminAgreementVersion[];
  dpaVersions: AdminAgreementVersion[];
}) {
  return (
    <div className="space-y-6">
      <TypeSection documentType="TERMS" versions={termVersions} />
      <TypeSection documentType="PRIVACY" versions={privacyVersions} />
      <TypeSection documentType="DPA" versions={dpaVersions} />
    </div>
  );
}

function TypeSection({ documentType, versions }: TypeSectionProps) {
  const t = useTranslations('admin.agreements');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [localVersions, setLocalVersions] = useState(versions);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);

  const current = localVersions.find((v) => v.is_current);

  function handleActivate(id: number) {
    setPendingId(id);
    startTransition(async () => {
      const result = await activateAgreementAction(id);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('activated'));
        setLocalVersions((prev) =>
          prev.map((v) => ({ ...v, is_current: v.id === id }))
        );
      }
      setPendingId(null);
    });
  }

  function handlePublished(newVersion: AdminAgreementVersion) {
    setLocalVersions((prev) => [
      newVersion,
      ...prev.map((v) => ({ ...v, is_current: false })),
    ]);
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="font-semibold">{TYPE_LABELS[documentType]}</h2>
          {current && (
            <Badge variant="outline" className="text-xs">
              {t('currentVersion', { version: current.version })}
            </Badge>
          )}
          {!current && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {t('noVersionPublished')}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPublishDialogOpen(true)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t('newVersion')}
          </Button>
        </div>
      </div>

      {localVersions.length > 0 && (
        <div className="p-4 sm:p-6">
          <button
            type="button"
            onClick={() => setHistoryOpen((o) => !o)}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {historyOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
            {t('versionHistory', { count: localVersions.length })}
          </button>

          {historyOpen && (
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('columns.version')}</TableHead>
                    <TableHead>{t('columns.publishedAt')}</TableHead>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead>{t('columns.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localVersions.map((v) => {
                    const rowPending = isPending && pendingId === v.id;
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono text-sm">{v.version}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {dateFormatter.format(new Date(v.created_at))}
                        </TableCell>
                        <TableCell>
                          {v.is_current ? (
                            <Badge className="bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30">
                              {t('statusCurrent')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              {t('statusInactive')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {!v.is_current && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={rowPending}
                              onClick={() => handleActivate(v.id)}
                            >
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                              {t('activate')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <PublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        documentType={documentType}
        currentVersionId={current?.id ?? null}
        onPublished={handlePublished}
      />
    </div>
  );
}

function PublishDialog({
  open,
  onOpenChange,
  documentType,
  currentVersionId,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: AgreementDocumentType;
  currentVersionId: number | null;
  onPublished: (v: AdminAgreementVersion) => void;
}) {
  const t = useTranslations('admin.agreements');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [version, setVersion] = useState('');
  const [content, setContent] = useState('');
  const [contentLoaded, setContentLoaded] = useState(false);

  function handleOpen(open: boolean) {
    if (open && currentVersionId && !contentLoaded) {
      setIsLoadingContent(true);
      fetch(`/api/admin/agreements/versions/${currentVersionId}`)
        .then((r) => r.json())
        .then((data: { document?: AdminAgreementDetail }) => {
          if (data.document?.contentMarkdown) {
            setContent(data.document.contentMarkdown);
            setContentLoaded(true);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingContent(false));
    }
    if (!open) {
      setVersion('');
      setContent('');
      setContentLoaded(false);
    }
    onOpenChange(open);
  }

  function handlePublish() {
    if (!version.trim() || !content.trim()) return;
    startTransition(async () => {
      const result = await publishAgreementAction(documentType, version.trim(), content);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('published'));
        onPublished(result.document);
        handleOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="flex flex-col sm:max-w-3xl h-[90vh] p-0 gap-0">
        <DialogHeader className="border-b border-border px-6 py-4 shrink-0">
          <DialogTitle>{t('publishDialog.title', { type: TYPE_LABELS[documentType] })}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
          <div className="shrink-0 space-y-1">
            <Label htmlFor="version-input">{t('publishDialog.versionLabel')}</Label>
            <Input
              id="version-input"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder={t('publishDialog.versionPlaceholder')}
              disabled={isPending}
              className="font-mono max-w-xs"
            />
          </div>

          <div className="flex flex-1 flex-col gap-1 overflow-hidden">
            <Label>{t('publishDialog.contentLabel')}</Label>
            {isLoadingContent ? (
              <div className="flex flex-1 items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
                {t('publishDialog.loadingContent')}
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('publishDialog.contentPlaceholder')}
                disabled={isPending}
                className="flex-1 resize-none font-mono text-xs leading-relaxed"
                style={{ minHeight: 0 }}
              />
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4 shrink-0">
          <Button variant="outline" onClick={() => handleOpen(false)} disabled={isPending}>
            {t('publishDialog.cancel')}
          </Button>
          <Button
            onClick={handlePublish}
            disabled={isPending || !version.trim() || !content.trim()}
          >
            {isPending ? t('publishDialog.publishing') : t('publishDialog.publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
