'use client';

import { useState, useTransition, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { marked } from 'marked';
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
import { FileText, Plus, RotateCcw, ChevronDown, ChevronUp, Eye, PenLine, X } from 'lucide-react';
import type { AdminAgreementVersion, AdminAgreementDetail, AgreementDocumentType } from '@/lib/admin-api';

// ── Markdown renderer ─────────────────────────────────────────────────────────

marked.setOptions({ breaks: true });

function renderWithHighlights(markdown: string): string {
  const html = marked.parse(markdown) as string;
  // Highlight {{placeholder}} tokens left unresolved in the stored template.
  return html.replace(
    /\{\{([\w.]+)\}\}/g,
    '<mark style="background:#fef3c7;color:#92400e;padding:0 2px;border-radius:3px;font-family:monospace;font-size:0.85em">{{$1}}</mark>',
  );
}

// ── Draft helpers (localStorage) ──────────────────────────────────────────────

interface AgreementDraft {
  version: string;
  content: string;
  savedAt: string;
}

function draftKey(type: AgreementDocumentType) {
  return `comprobify_agreement_draft_${type}`;
}

function loadDraft(type: AgreementDocumentType): AgreementDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(draftKey(type));
    return raw ? (JSON.parse(raw) as AgreementDraft) : null;
  } catch {
    return null;
  }
}

function persistDraft(type: AgreementDocumentType, draft: AgreementDraft): void {
  localStorage.setItem(draftKey(type), JSON.stringify(draft));
}

function removeDraft(type: AgreementDocumentType): void {
  localStorage.removeItem(draftKey(type));
}

// ── Shared constants ──────────────────────────────────────────────────────────

const dateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' });
const shortDateFormatter = new Intl.DateTimeFormat('es-EC', { dateStyle: 'short', timeStyle: 'short' });

const TYPE_LABELS: Record<AgreementDocumentType, string> = {
  TERMS: 'Términos de Servicio',
  PRIVACY: 'Política de Privacidad',
  DPA: 'Acuerdo de Procesamiento de Datos',
};

// ── Root component ────────────────────────────────────────────────────────────

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

// ── TypeSection ───────────────────────────────────────────────────────────────

type EditorMode = 'new' | 'draft';

function TypeSection({
  documentType,
  versions,
}: {
  documentType: AgreementDocumentType;
  versions: AdminAgreementVersion[];
}) {
  const t = useTranslations('admin.agreements');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [localVersions, setLocalVersions] = useState(versions);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState<AgreementDraft | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [viewTarget, setViewTarget] = useState<AdminAgreementVersion | null>(null);

  useEffect(() => {
    setDraft(loadDraft(documentType));
  }, [documentType]);

  const current = localVersions.find((v) => v.is_current);

  function handleActivate(id: number) {
    setPendingId(id);
    startTransition(async () => {
      const result = await activateAgreementAction(id);
      if ('error' in result) {
        toastApiError(result.error, tError);
      } else {
        toast.success(t('activated'));
        setLocalVersions((prev) => prev.map((v) => ({ ...v, is_current: v.id === id })));
      }
      setPendingId(null);
    });
  }

  function handlePublished(newVersion: AdminAgreementVersion) {
    setLocalVersions((prev) => [newVersion, ...prev.map((v) => ({ ...v, is_current: false }))]);
    handleDeleteDraft();
    setEditorMode(null);
  }

  function handleDeleteDraft() {
    removeDraft(documentType);
    setDraft(null);
  }

  function handleDraftSaved(saved: AgreementDraft) {
    persistDraft(documentType, saved);
    setDraft(saved);
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      {/* Card header */}
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <h2 className="font-semibold">{TYPE_LABELS[documentType]}</h2>
          {current ? (
            <Badge variant="outline" className="text-xs">
              {t('currentVersion', { version: current.version })}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {t('noVersionPublished')}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {draft && (
            <Button size="sm" variant="outline" onClick={() => setEditorMode('draft')}>
              <PenLine className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {t('editDraft')}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditorMode('new')}>
            <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t('newVersion')}
          </Button>
        </div>
      </div>

      {/* Draft banner */}
      {draft && (
        <div className="flex items-center justify-between border-b border-border bg-amber-50/50 px-4 py-2.5 dark:bg-amber-500/5 sm:px-6">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 text-xs">
              {t('draft')}
            </Badge>
            {draft.version && (
              <span className="font-mono text-xs text-foreground">{draft.version}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {t('draftSavedAt', { date: shortDateFormatter.format(new Date(draft.savedAt)) })}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={handleDeleteDraft}
            aria-label={t('deleteDraft')}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      )}

      {/* Version history */}
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
                    <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('columns.version')}
                    </TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('columns.publishedAt')}
                    </TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('columns.status')}
                    </TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('columns.actions')}
                    </TableHead>
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
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setViewTarget(v)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
                              {t('view')}
                            </Button>
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
                          </div>
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

      <EditorDialog
        open={editorMode !== null}
        onClose={() => setEditorMode(null)}
        documentType={documentType}
        mode={editorMode ?? 'new'}
        currentVersionId={current?.id ?? null}
        existingDraft={draft}
        onPublished={handlePublished}
        onDraftSaved={handleDraftSaved}
      />

      {viewTarget && (
        <ViewVersionDialog
          version={viewTarget}
          documentType={documentType}
          onClose={() => setViewTarget(null)}
        />
      )}
    </div>
  );
}

// ── Editor dialog (split-pane: markdown left, live preview right) ─────────────

function EditorDialog({
  open,
  onClose,
  documentType,
  mode,
  currentVersionId,
  existingDraft,
  onPublished,
  onDraftSaved,
}: {
  open: boolean;
  onClose: () => void;
  documentType: AgreementDocumentType;
  mode: EditorMode;
  currentVersionId: number | null;
  existingDraft: AgreementDraft | null;
  onPublished: (v: AdminAgreementVersion) => void;
  onDraftSaved: (d: AgreementDraft) => void;
}) {
  const t = useTranslations('admin.agreements');
  const tError = useTranslations('apiError');
  const [isPending, startTransition] = useTransition();
  const [version, setVersion] = useState('');
  const [content, setContent] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // On open, seed editor with draft or current published content.
  useEffect(() => {
    if (!open) return;

    if (mode === 'draft' && existingDraft) {
      setVersion(existingDraft.version);
      setContent(existingDraft.content);
      return;
    }

    // mode === 'new': fetch current published content.
    if (currentVersionId) {
      setIsLoadingContent(true);
      fetch(`/api/admin/agreements/versions/${currentVersionId}`)
        .then((r) => r.json())
        .then((data: { document?: AdminAgreementDetail }) => {
          setContent(data.document?.contentMarkdown ?? '');
        })
        .catch(() => {})
        .finally(() => setIsLoadingContent(false));
    } else {
      setContent('');
    }
    setVersion('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetFromPublished() {
    if (!currentVersionId) return;
    setIsLoadingContent(true);
    fetch(`/api/admin/agreements/versions/${currentVersionId}`)
      .then((r) => r.json())
      .then((data: { document?: AdminAgreementDetail }) => {
        setContent(data.document?.contentMarkdown ?? '');
      })
      .catch(() => {})
      .finally(() => setIsLoadingContent(false));
  }

  function handleSaveDraft() {
    const saved: AgreementDraft = { version, content, savedAt: new Date().toISOString() };
    onDraftSaved(saved);
    toast.success(t('draftSaved'));
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
      }
    });
  }

  const preview = useMemo(
    () => (content ? renderWithHighlights(content) : ''),
    [content],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col sm:max-w-[95vw] sm:w-[95vw] h-[90vh] p-0 gap-0">
        <DialogHeader className="flex-row items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <DialogTitle className="text-base">
            {t('editorDialog.title', { type: TYPE_LABELS[documentType] })}
          </DialogTitle>
          {mode === 'draft' && currentVersionId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={resetFromPublished}
              disabled={isLoadingContent}
            >
              {t('editorDialog.resetFromPublished')}
            </Button>
          )}
        </DialogHeader>

        {/* Version input */}
        <div className="shrink-0 border-b border-border px-6 py-3">
          <div className="flex items-center gap-3">
            <Label htmlFor={`version-${documentType}`} className="shrink-0 text-sm">
              {t('editorDialog.versionLabel')}
            </Label>
            <Input
              id={`version-${documentType}`}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder={t('editorDialog.versionPlaceholder')}
              disabled={isPending}
              className="font-mono max-w-[180px] h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground">{t('editorDialog.versionHint')}</span>
          </div>
        </div>

        {/* Split pane */}
        <div className="flex flex-1 overflow-hidden divide-x divide-border">
          {/* Left: markdown editor */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border">
              {t('editorDialog.editorLabel')}
            </div>
            {isLoadingContent ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('editorDialog.loadingContent')}
              </div>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('editorDialog.contentPlaceholder')}
                disabled={isPending}
                className="flex-1 resize-none font-mono text-xs leading-relaxed rounded-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                style={{ minHeight: 0 }}
              />
            )}
          </div>

          {/* Right: live HTML preview */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border">
              {t('editorDialog.previewLabel')}
            </div>
            <div
              className="flex-1 overflow-y-auto p-5 text-sm
                [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-2 [&_h1]:leading-tight
                [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5
                [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-4
                [&_p]:mb-3 [&_p]:leading-relaxed
                [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1
                [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1
                [&_li]:leading-relaxed
                [&_strong]:font-semibold
                [&_em]:italic
                [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
                [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono
                [&_pre]:bg-muted [&_pre]:rounded [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:mb-3
                [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-3
                [&_hr]:border-border [&_hr]:my-4"
              dangerouslySetInnerHTML={{ __html: preview || `<p class="text-muted-foreground italic">${t('editorDialog.previewEmpty')}</p>` }}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t('editorDialog.cancel')}
          </Button>
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isPending || !content.trim()}
          >
            {t('editorDialog.saveDraft')}
          </Button>
          <Button
            onClick={handlePublish}
            disabled={isPending || !version.trim() || !content.trim()}
          >
            {isPending ? t('editorDialog.publishing') : t('editorDialog.publish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── View version dialog (read-only HTML preview) ──────────────────────────────

function ViewVersionDialog({
  version,
  documentType,
  onClose,
}: {
  version: AdminAgreementVersion;
  documentType: AgreementDocumentType;
  onClose: () => void;
}) {
  const t = useTranslations('admin.agreements');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/agreements/versions/${version.id}`)
      .then((r) => r.json())
      .then((data: { document?: AdminAgreementDetail }) => {
        const md = data.document?.contentMarkdown ?? '';
        setHtml(renderWithHighlights(md));
      })
      .catch(() => setHtml(''))
      .finally(() => setLoading(false));
  }, [version.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex flex-col sm:max-w-3xl h-[90vh] p-0 gap-0">
        <DialogHeader className="border-b border-border px-6 py-4 shrink-0">
          <DialogTitle className="text-sm">
            {TYPE_LABELS[documentType]}
            {' — '}
            <span className="font-mono">{version.version}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('viewDialog.publishedAt', {
              date: dateFormatter.format(new Date(version.created_at)),
            })}
          </p>
        </DialogHeader>

        <div
          className="flex-1 overflow-y-auto p-6 text-sm
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-2 [&_h1]:leading-tight
            [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5
            [&_h3]:text-base [&_h3]:font-medium [&_h3]:mb-2 [&_h3]:mt-4
            [&_p]:mb-3 [&_p]:leading-relaxed
            [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1
            [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1
            [&_li]:leading-relaxed
            [&_strong]:font-semibold
            [&_em]:italic
            [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
            [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono
            [&_pre]:bg-muted [&_pre]:rounded [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:mb-3
            [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:mb-3
            [&_hr]:border-border [&_hr]:my-4"
        >
          {loading ? (
            <p className="text-muted-foreground">{t('viewDialog.loading')}</p>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
