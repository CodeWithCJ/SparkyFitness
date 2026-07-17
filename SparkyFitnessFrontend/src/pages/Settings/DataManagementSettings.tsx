import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDownloadDiaryExport } from '@/hooks/Diary/useFoodEntries';
import {
  useSyncedSources,
  useDeleteSyncedSource,
} from '@/hooks/Settings/useSyncedData';
import { useToast } from '@/hooks/use-toast';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Human-friendly names for the provider `source` tags stored on synced rows.
const SOURCE_LABELS: Record<string, string> = {
  healthkit: 'Apple Health',
  health_connect: 'Health Connect',
  garmin: 'Garmin',
  withings: 'Withings',
  fitbit: 'Fitbit',
  googlehealth: 'Google Health',
  imported: 'Imported',
  CSV: 'CSV Import',
  CSV_Import: 'CSV Import',
};

const prettifySource = (source: string): string =>
  SOURCE_LABELS[source] ?? source;

export const DataManagementSettings = () => {
  const { t, i18n } = useTranslation();
  const [delimiter, setDelimiter] = useState<string>(';');
  const { toast } = useToast();
  const { mutateAsync: exportDiary, isPending: isExporting } =
    useDownloadDiaryExport();

  const { data: syncedSources = [], isLoading: isLoadingSources } =
    useSyncedSources();
  const { mutate: deleteSyncedSource, isPending: isDeletingSource } =
    useDeleteSyncedSource();
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedSummary = syncedSources.find(
    (s) => s.source === selectedSource
  );

  const handleConfirmDelete = () => {
    if (!selectedSource) return;
    deleteSyncedSource(selectedSource, {
      onSuccess: () => {
        setSelectedSource('');
      },
    });
    setConfirmOpen(false);
  };

  const handleExportDiary = async () => {
    try {
      const blob = await exportDiary({
        delimiter,
        locale: i18n.language,
      });

      // Create a link to download the blob
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sparkyfitness_diary_export.csv');
      document.body.appendChild(link);
      link.click();

      // Cleanup
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: t('settings.dataManagement.exportSuccess', 'Export successful'),
        description: t(
          'settings.dataManagement.exportSuccessDescription',
          'Your diary has been exported successfully.'
        ),
      });
    } catch (error) {
      console.error('Error exporting diary:', error);
      toast({
        title: t('settings.dataManagement.exportError', 'Export error'),
        description: t(
          'settings.dataManagement.exportErrorDescription',
          'Unable to download your diary. Please try again later.'
        ),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">
          {t('settings.dataManagement.title', 'Data Export')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.dataManagement.description',
            'Download your entire food diary in CSV format. The file will contain all your meals with food details, portions and macros (calories, protein, carbs, fat...).'
          )}
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              {t(
                'settings.dataManagement.delimiterLabel',
                'CSV delimiter format'
              )}
            </label>
            <Select value={delimiter} onValueChange={setDelimiter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue
                  placeholder={t(
                    'settings.dataManagement.delimiterPlaceholder',
                    'Delimiter'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=";">
                  {t('settings.dataManagement.semicolon', 'Semicolon (;)')}
                </SelectItem>
                <SelectItem value=",">
                  {t('settings.dataManagement.comma', 'Comma (,)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleExportDiary}
            disabled={isExporting}
            className="flex items-center gap-2"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting
              ? t('settings.dataManagement.exporting', 'Preparing...')
              : t(
                  'settings.dataManagement.exportButton',
                  'Export my diary (CSV)'
                )}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t pt-6">
        <h3 className="text-lg font-medium">
          {t(
            'settings.dataManagement.deleteSynced.title',
            'Delete synced data'
          )}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.dataManagement.deleteSynced.description',
            'Remove all entries that were synced or imported from a specific source (e.g. Apple Health, Garmin). This affects only synced data — entries you added manually are never touched. This cannot be undone.'
          )}
        </p>
        <div className="mt-1 rounded-md border border-muted bg-muted/40 p-3 text-sm text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">
            {t(
              'settings.dataManagement.deleteSynced.scopeNoteTitle',
              'What this removes'
            )}
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>
              {t(
                'settings.dataManagement.deleteSynced.scopeIncludes',
                'Deletes synced diary entries: food, exercise/workout sessions, sleep, water, and custom check-in measurements.'
              )}
            </li>
            <li>
              {t(
                'settings.dataManagement.deleteSynced.scopeExcludesLibrary',
                'Does NOT delete your food or exercise database (the reusable food/exercise definitions) — only the logged entries.'
              )}
            </li>
            <li>
              {t(
                'settings.dataManagement.deleteSynced.scopeExcludesCheckin',
                'Does NOT delete standard check-in measurements (weight, steps, body fat, height) — those merge all providers into one daily value and cannot be removed by source here.'
              )}
            </li>
            <li>
              {t(
                'settings.dataManagement.deleteSynced.scopeExcludesManual',
                'Does NOT delete anything you created yourself — entries you typed in, logged via the Sparky assistant, or workouts from a saved preset or plan are always kept.'
              )}
            </li>
          </ul>
        </div>

        {isLoadingSources ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t(
              'settings.dataManagement.deleteSynced.loading',
              'Loading sources...'
            )}
          </div>
        ) : syncedSources.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              'settings.dataManagement.deleteSynced.empty',
              'No synced data found. Nothing to delete here.'
            )}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t(
                  'settings.dataManagement.deleteSynced.sourceLabel',
                  'Data source'
                )}
              </label>
              <Select value={selectedSource} onValueChange={setSelectedSource}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue
                    placeholder={t(
                      'settings.dataManagement.deleteSynced.sourcePlaceholder',
                      'Select a source'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {syncedSources.map((s) => (
                    <SelectItem key={s.source} value={s.source}>
                      {prettifySource(s.source)} — {s.totalCount}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={!selectedSource || isDeletingSource}
              className="flex items-center gap-2"
            >
              {isDeletingSource ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t(
                'settings.dataManagement.deleteSynced.deleteButton',
                'Delete synced data'
              )}
            </Button>
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmDelete}
        variant="destructive"
        confirmLabel={t(
          'settings.dataManagement.deleteSynced.confirmButton',
          'Delete permanently'
        )}
        title={t(
          'settings.dataManagement.deleteSynced.confirmTitle',
          'Delete synced data?'
        )}
        description={t(
          'settings.dataManagement.deleteSynced.confirmDescription',
          'This will permanently delete {{count}} entries synced from {{source}}. Manually-entered data is not affected.',
          {
            count: selectedSummary?.totalCount ?? 0,
            source: selectedSource ? prettifySource(selectedSource) : '',
          }
        )}
        warning={t(
          'settings.dataManagement.deleteSynced.confirmWarning',
          'This action cannot be undone. Make sure you have a recent database backup before deleting.'
        )}
      />
    </div>
  );
};
