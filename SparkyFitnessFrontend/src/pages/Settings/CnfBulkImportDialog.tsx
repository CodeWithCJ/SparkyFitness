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
import { Input } from '@/components/ui/input';
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
  useCnfStatusQuery,
  useCnfBulkImportMutation,
  useDeleteCnfLibraryMutation,
} from '@/hooks/Foods/useCanadianNutrientFile';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  Loader2,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

interface CnfBulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CnfBulkImportDialog({
  open,
  onOpenChange,
}: CnfBulkImportDialogProps) {
  const { t } = useTranslation();
  const { data: status } = useCnfStatusQuery();
  const { mutate: startImport, isPending: isStartingImport } =
    useCnfBulkImportMutation();
  const { mutate: deleteLibrary, isPending: isDeletingLibrary } =
    useDeleteCnfLibraryMutation();

  const [syncMode, setSyncMode] = useState<'library_only' | 'library_and_past'>(
    'library_only'
  );
  const [sourceType, setSourceType] = useState<'official' | 'upload'>(
    'official'
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<'en' | 'fr'>('en');
  const [isDryRun, setIsDryRun] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isRunning = status?.isRunning ?? false;

  const handleStartImport = () => {
    const syncPastEntries = syncMode === 'library_and_past';
    const maxFoods = isDryRun ? 10 : undefined;

    if (sourceType === 'upload') {
      if (!selectedFile) return;
      startImport({
        file: selectedFile,
        syncPastEntries,
        language,
        maxFoods,
      });
    } else {
      // Official archive download
      startImport({
        syncPastEntries,
        language,
        maxFoods,
      });
    }
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
                'settings.cnf.dialogTitle',
                'Canadian Nutrient File Bulk Import & Sync'
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                'settings.cnf.dialogDescription',
                'Import or update the complete Health Canada food catalog (~5,700 items) into your food library.'
              )}
            </DialogDescription>
          </DialogHeader>

          {isRunning ? (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>
                  {t(
                    'settings.cnf.importingProgress',
                    'Importing catalog in progress...'
                  )}
                </span>
                <span className="ml-auto font-mono text-xs">
                  {status?.progress ?? 0}%
                </span>
              </div>
              <Progress value={status?.progress ?? 0} />
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  {t('settings.cnf.processed', 'Processed')}:{' '}
                  <span>{status?.processed}</span> /{' '}
                  <span>{status?.total}</span>
                </div>
                <div className="text-right">
                  {t('settings.cnf.imported', 'Imported')}:{' '}
                  <span>{status?.imported}</span> |{' '}
                  {t('settings.cnf.updated', 'Updated')}:{' '}
                  <span>{status?.updated}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5 py-2">
              {status?.status === 'completed' && (
                <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    {t(
                      'settings.cnf.lastImportSuccess',
                      'Last sync completed successfully ({{imported}} added, {{updated}} updated).',
                      {
                        imported: status.imported,
                        updated: status.updated,
                      }
                    )}
                  </span>
                </div>
              )}

              {status?.status === 'failed' && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {t(
                      'settings.cnf.lastImportFailed',
                      'Last sync failed: {{error}}',
                      {
                        error: status.error || 'Unknown error',
                      }
                    )}
                  </span>
                </div>
              )}

              {/* Sync Mode */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  {t('settings.cnf.syncScopeLabel', 'Sync Scope')}
                </Label>
                <RadioGroup
                  value={syncMode}
                  onValueChange={(val) =>
                    setSyncMode(val as 'library_only' | 'library_and_past')
                  }
                  className="gap-3"
                >
                  <div className="flex items-start space-x-2 rounded-md border p-3 hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem
                      value="library_only"
                      id="cnf-sync-library"
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="cnf-sync-library"
                      className="cursor-pointer text-sm font-normal"
                    >
                      <span className="font-medium text-foreground">
                        {t(
                          'settings.cnf.modeLibraryOnly',
                          'Sync library only (Recommended)'
                        )}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'settings.cnf.modeLibraryOnlyDesc',
                          'Upserts food items, updates portion measures and saved recipe snapshots. Past diary entries are preserved untouched.'
                        )}
                      </p>
                    </label>
                  </div>

                  <div className="flex items-start space-x-2 rounded-md border p-3 hover:bg-muted/50 cursor-pointer">
                    <RadioGroupItem
                      value="library_and_past"
                      id="cnf-sync-past"
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="cnf-sync-past"
                      className="cursor-pointer text-sm font-normal"
                    >
                      <span className="font-medium text-foreground">
                        {t(
                          'settings.cnf.modeLibraryAndPast',
                          'Sync library & past entries'
                        )}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'settings.cnf.modeLibraryAndPastDesc',
                          'Updates the library and also recalculates historical diary logs logged from Canadian Nutrient File to match latest data.'
                        )}
                      </p>
                    </label>
                  </div>
                </RadioGroup>
              </div>

              {/* Language Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  {t('settings.cnf.languageLabel', 'Catalog Language')}
                </Label>
                <Select
                  value={language}
                  onValueChange={(val) => setLanguage(val as 'en' | 'fr')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English (default)</SelectItem>
                    <SelectItem value="fr">Français (French)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Data Source Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  {t('settings.cnf.sourceLabel', 'Source')}
                </Label>
                <Select
                  value={sourceType}
                  onValueChange={(val) =>
                    setSourceType(val as 'official' | 'upload')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="official">
                      {t(
                        'settings.cnf.officialArchive',
                        'Official Health Canada Open Data Archive (Default)'
                      )}
                    </SelectItem>
                    <SelectItem value="upload">
                      {t(
                        'settings.cnf.uploadZip',
                        'Upload local ZIP archive (cnf-fcen-csv.zip)'
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>

                {sourceType === 'upload' && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {t('settings.cnf.needArchive', "Don't have the file?")}
                      </span>
                      <a
                        href="https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource/019f2a90-e3a9-489d-b6e1-f74f4ba1d006/download/cnf_fcen_all-files-data_2026.zip"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                      >
                        <Download className="h-3 w-3" />
                        {t(
                          'settings.cnf.downloadArchiveLink',
                          'Download Official CNF ZIP (26 MB)'
                        )}
                      </a>
                    </div>
                    <Input
                      type="file"
                      accept=".zip"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSelectedFile(file);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'settings.cnf.uploadHelp',
                        'Select the official CNF ZIP archive downloaded from open.canada.ca.'
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-start space-x-2 pt-3 border-t">
                <Checkbox
                  id="dry_run"
                  checked={isDryRun}
                  onCheckedChange={(checked) => setIsDryRun(!!checked)}
                />
                <div className="grid gap-1 leading-none">
                  <Label
                    htmlFor="dry_run"
                    className="text-sm font-medium cursor-pointer"
                  >
                    {t(
                      'settings.cnf.dryRunLabel',
                      'Sample Import (first 10 foods only)'
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'settings.cnf.dryRunHelp',
                      'Import up to 10 foods to verify portion measurements and custom nutrient mappings before running the full import.'
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                <Trans
                  i18nKey="settings.cnf.licenceNotice"
                  defaults="Contains information published by Health Canada licensed under the <1>Open Government Licence – Canada</1>."
                  components={{
                    1: (
                      <a
                        href="https://open.canada.ca/en/open-government-licence-canada"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      />
                    ),
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t">
            {!isRunning && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={isDeletingLibrary}
                className="text-destructive hover:bg-destructive/10 self-start"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t('settings.cnf.clearLibrary', 'Clear CNF Library')}
              </Button>
            )}

            <div className="flex items-center gap-2 self-end">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isRunning}
              >
                {t('common.close', 'Close')}
              </Button>
              <Button
                onClick={handleStartImport}
                disabled={
                  isRunning ||
                  isStartingImport ||
                  (sourceType === 'upload' && !selectedFile)
                }
              >
                {isStartingImport ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-4 w-4" />
                )}
                {t('settings.cnf.startImport', 'Start Import / Sync')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={t(
          'settings.cnf.confirmDeleteTitle',
          'Clear Canadian Nutrient File Library?'
        )}
        description={t(
          'settings.cnf.confirmDeleteDesc',
          'This will remove all Canadian Nutrient File foods from your library. Your past diary entries referencing these foods will be safely preserved.'
        )}
        confirmLabel={t('common.delete', 'Delete')}
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
