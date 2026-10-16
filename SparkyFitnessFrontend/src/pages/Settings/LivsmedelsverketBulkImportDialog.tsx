import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useLivsmedelsverketStatusQuery,
  useLivsmedelsverketBulkImportMutation,
  useDeleteLivsmedelsverketLibraryMutation,
} from '@/hooks/Foods/useLivsmedelsverket';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  Loader2,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

interface LivsmedelsverketBulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LivsmedelsverketBulkImportDialog({
  open,
  onOpenChange,
}: LivsmedelsverketBulkImportDialogProps) {
  const { t, i18n } = useTranslation();
  const { data: status } = useLivsmedelsverketStatusQuery();
  const { mutate: startImport, isPending: isStartingImport } =
    useLivsmedelsverketBulkImportMutation();
  const { mutate: deleteLibrary, isPending: isDeletingLibrary } =
    useDeleteLivsmedelsverketLibraryMutation();

  const [syncMode, setSyncMode] = useState<'library_only' | 'library_and_past'>(
    'library_only'
  );
  const [language, setLanguage] = useState<'sv' | 'en'>(
    i18n.language.startsWith('sv') ? 'sv' : 'en'
  );
  const [isDryRun, setIsDryRun] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isRunning = status?.isRunning ?? false;

  const handleStartImport = () => {
    const syncPastEntries = syncMode === 'library_and_past';
    const maxFoods = isDryRun ? 10 : undefined;

    startImport({
      syncPastEntries,
      language,
      maxFoods,
    });
  };

  const handleConfirmDelete = () => {
    deleteLibrary();
    setConfirmDeleteOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t(
                'settings.livsmedelsverket.dialogTitle',
                'Swedish Food Agency (Livsmedelsverket) Bulk Import'
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                'settings.livsmedelsverket.dialogDescription',
                'Download the official Swedish Food Composition Database (~2,600 foods) into your food library for offline and instant search.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {isRunning && (
              <div className="space-y-2 p-3 bg-muted rounded-md">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    {t(
                      'settings.livsmedelsverket.importing',
                      'Importing foods...'
                    )}
                  </span>
                  <span>{status?.progress ?? 0}%</span>
                </div>
                <Progress value={status?.progress ?? 0} />
                <p className="text-xs text-muted-foreground">
                  {t(
                    'settings.livsmedelsverket.progressText',
                    '{{processed}} / {{total}} foods processed ({{imported}} imported, {{updated}} updated)',
                    {
                      processed: status?.processed ?? 0,
                      total: status?.total ?? 0,
                      imported: status?.imported ?? 0,
                      updated: status?.updated ?? 0,
                    }
                  )}
                </p>
              </div>
            )}

            {!isRunning && status?.status === 'completed' && (
              <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-700 dark:text-green-400 rounded-md text-sm">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                <span>
                  {t(
                    'settings.livsmedelsverket.completed',
                    'Last import completed: {{imported}} imported, {{updated}} updated ({{total}} total).',
                    {
                      imported: status.imported,
                      updated: status.updated,
                      total: status.total,
                    }
                  )}
                </span>
              </div>
            )}

            {!isRunning && status?.status === 'failed' && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>
                  {t('settings.livsmedelsverket.failed', 'Import failed: ')}
                  {status.error}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="slv-language">
                {t('settings.livsmedelsverket.language', 'Language')}
              </Label>
              <Select
                value={language}
                onValueChange={(val) => setLanguage(val as 'sv' | 'en')}
                disabled={isRunning}
              >
                <SelectTrigger id="slv-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sv">
                    Svenska (Swedish) - Svensk livsmedelsdatabas
                  </SelectItem>
                  <SelectItem value="en">
                    English - Swedish Food Composition Database
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                {t('settings.livsmedelsverket.syncMode', 'Sync Mode')}
              </Label>
              <RadioGroup
                value={syncMode}
                onValueChange={(val) =>
                  setSyncMode(val as 'library_only' | 'library_and_past')
                }
                disabled={isRunning}
                className="space-y-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="library_only" id="slv-mode-lib" />
                  <Label htmlFor="slv-mode-lib" className="text-sm font-normal">
                    {t(
                      'settings.livsmedelsverket.libraryOnly',
                      'Library foods only (recommended)'
                    )}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="library_and_past" id="slv-mode-past" />
                  <Label
                    htmlFor="slv-mode-past"
                    className="text-sm font-normal"
                  >
                    {t(
                      'settings.livsmedelsverket.libraryAndPast',
                      'Library foods and refresh past diary entries'
                    )}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <Checkbox
                id="slv-dry-run"
                checked={isDryRun}
                onCheckedChange={(checked) => setIsDryRun(!!checked)}
                disabled={isRunning}
              />
              <Label htmlFor="slv-dry-run" className="text-sm font-normal">
                {t(
                  'settings.livsmedelsverket.testMode',
                  'Test Mode (import only 10 foods to verify)'
                )}
              </Label>
            </div>

            <div className="text-xs text-muted-foreground border-t pt-3">
              <Trans
                i18nKey="settings.livsmedelsverket.attributionText"
                defaults="Data provided by the Swedish Food Agency (Livsmedelsverket) licensed under <1>Creative Commons Attribution 4.0 (CC BY 4.0)</1>."
                components={{
                  1: (
                    <a
                      href="https://creativecommons.org/licenses/by/4.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    />
                  ),
                }}
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={isRunning || isDeletingLibrary}
              className="gap-1.5"
            >
              {isDeletingLibrary ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t(
                'settings.livsmedelsverket.clearLibrary',
                'Purge Library Foods'
              )}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isRunning}
              >
                {t('common.close', 'Close')}
              </Button>
              <Button
                type="button"
                onClick={handleStartImport}
                disabled={isRunning || isStartingImport}
                className="gap-1.5"
              >
                {isStartingImport ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t('settings.livsmedelsverket.startImport', 'Start Import')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        onConfirm={handleConfirmDelete}
        title={t(
          'settings.livsmedelsverket.confirmDeleteTitle',
          'Purge Livsmedelsverket Library Foods?'
        )}
        description={t(
          'settings.livsmedelsverket.confirmDeleteMessage',
          'This will permanently delete all Swedish Food Agency items from your personal food library. Past food diary entries logged from these items will be preserved.'
        )}
        confirmLabel={t('common.delete', 'Delete')}
        variant="destructive"
      />
    </>
  );
}
