import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Loader2, Activity, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import {
  usePreviewClinicalRecords,
  useExecuteClinicalImport,
  type ClinicalImportPreviewResponse,
  type ParsedVital,
  type ParsedLab,
} from '@/hooks/ClinicalRecords/useClinicalRecords';

const PREVIEW_SAMPLE_LIMIT = 10;

interface ClinicalRecordImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

const ClinicalRecordImportDialog = ({
  open,
  onOpenChange,
  onImportComplete,
}: ClinicalRecordImportDialogProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewGenRef = useRef(0);
  const importGenRef = useRef(0);

  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<ClinicalImportPreviewResponse | null>(
    null
  );

  const [includeVitals, setIncludeVitals] = useState(true);
  const [includeLabs, setIncludeLabs] = useState(true);

  const previewMutation = usePreviewClinicalRecords();
  const importMutation = useExecuteClinicalImport();

  const loading = previewMutation.isPending;
  const importing = importMutation.isPending;

  const reset = () => {
    previewGenRef.current++;
    importGenRef.current++;
    setPreview(null);
    setIncludeVitals(true);
    setIncludeLabs(true);
    setDragActive(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const processFile = async (file: File) => {
    const currentGen = ++previewGenRef.current;
    try {
      const data = await previewMutation.mutateAsync(file);
      if (currentGen !== previewGenRef.current) return;
      setPreview(data);
      setIncludeVitals(data.vitals.length > 0);
      setIncludeLabs(data.labs.length > 0);
    } catch (err) {
      if (currentGen !== previewGenRef.current) return;
      toast({
        title: t('common.error', 'Error'),
        description:
          err instanceof Error
            ? err.message
            : t(
                'settings.dataImport.clinical.readFailed',
                'Failed to read clinical health document'
              ),
        variant: 'destructive',
      });
      reset();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleImport = async () => {
    if (!preview) return;

    const vitalsToImport = includeVitals ? preview.vitals : [];
    const labsToImport = includeLabs ? preview.labs : [];

    if (vitalsToImport.length === 0 && labsToImport.length === 0) {
      toast({
        title: t('common.notice', 'Notice'),
        description: t(
          'settings.dataImport.clinical.noRowsSelected',
          'No vitals or labs selected for import'
        ),
      });
      return;
    }

    const currentImportGen = ++importGenRef.current;
    try {
      const result = await importMutation.mutateAsync({
        vitals: vitalsToImport,
        labs: labsToImport,
        sourceLabel: 'mychart_clinical_import',
      });

      if (currentImportGen !== importGenRef.current) return;

      if (result.errors && result.errors.length > 0) {
        toast({
          title: t('common.error', 'Error'),
          description: result.errors.join(', '),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('common.success', 'Success'),
        description: t(
          'settings.dataImport.clinical.importSuccess',
          'Imported {{vitals}} vital(s) and {{labs}} lab result(s)',
          {
            vitals: result.vitalsImported,
            labs: result.labsImported,
          }
        ),
      });

      handleOpenChange(false);
      onImportComplete?.();
    } catch (err) {
      if (currentImportGen !== importGenRef.current) return;
      toast({
        title: t('common.error', 'Error'),
        description:
          err instanceof Error
            ? err.message
            : t(
                'settings.dataImport.clinical.importFailed',
                'Failed to import clinical records'
              ),
        variant: 'destructive',
      });
    }
  };

  const totalSelectedCount =
    (includeVitals && preview ? preview.vitals.length : 0) +
    (includeLabs && preview ? preview.labs.length : 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {t(
              'settings.dataImport.clinical.title',
              'Import C-CDA Clinical Records'
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'settings.dataImport.clinical.description',
              'Upload a C-CDA XML export (e.g. Epic MyChart DOC*.XML) or a Lucy .zip archive to import vitals and historical lab panels.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {!preview ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg space-y-4 transition-colors cursor-pointer',
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              )}
              onClick={() => {
                if (!loading) fileInputRef.current?.click();
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xml,.zip"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="p-3 bg-muted rounded-full">
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {dragActive ? (
                  <span className="text-primary font-medium">
                    {t(
                      'settings.dataImport.clinical.dropPrompt',
                      'Drop your C-CDA file here'
                    )}
                  </span>
                ) : (
                  t(
                    'settings.dataImport.clinical.selectFilePrompt',
                    'Drag & drop or choose an uncompressed C-CDA .xml file or MyChart Lucy .zip archive'
                  )
                )}
              </p>
              <Button
                variant="outline"
                disabled={loading}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                {loading
                  ? t('common.loading', 'Processing...')
                  : t('settings.dataImport.clinical.chooseFile', 'Choose File')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm bg-muted/50 p-3 rounded-lg border">
                <div>
                  <div className="font-medium">
                    {t(
                      'settings.dataImport.clinical.documentsDetected',
                      '{{count}} document(s) detected',
                      { count: preview.sourceDocuments.length }
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t(
                      'settings.dataImport.clinical.countsSummary',
                      '{{vitals}} vitals · {{labs}} lab results',
                      {
                        vitals: preview.vitalsCount,
                        labs: preview.labsCount,
                      }
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={importing || loading}
                  onClick={() => {
                    setPreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  {t('common.changeFile', 'Change File')}
                </Button>
              </div>

              {/* Category Import Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className={cn(
                    'flex items-center justify-between p-3.5 rounded-lg border transition-colors',
                    includeVitals ? 'border-primary/40 bg-primary/5' : 'bg-card'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-md text-primary">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {t('settings.dataImport.clinical.vitalsTab', 'Vitals')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(
                          'settings.dataImport.clinical.recordsDetected',
                          '{{count}} records detected',
                          { count: preview.vitals.length }
                        )}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={includeVitals}
                    disabled={preview.vitals.length === 0}
                    onCheckedChange={setIncludeVitals}
                    aria-label={t(
                      'settings.dataImport.clinical.toggleVitals',
                      'Toggle vitals import'
                    )}
                  />
                </div>

                <div
                  className={cn(
                    'flex items-center justify-between p-3.5 rounded-lg border transition-colors',
                    includeLabs ? 'border-primary/40 bg-primary/5' : 'bg-card'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded-md text-primary">
                      <FlaskConical className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {t(
                          'settings.dataImport.clinical.labsTab',
                          'Lab Results'
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(
                          'settings.dataImport.clinical.recordsDetected',
                          '{{count}} records detected',
                          { count: preview.labs.length }
                        )}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={includeLabs}
                    disabled={preview.labs.length === 0}
                    onCheckedChange={setIncludeLabs}
                    aria-label={t(
                      'settings.dataImport.clinical.toggleLabs',
                      'Toggle labs import'
                    )}
                  />
                </div>
              </div>

              {/* Sampled Preview Tabs */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t(
                      'settings.dataImport.clinical.samplePreviewTitle',
                      'Data Sample Preview'
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      'settings.dataImport.clinical.samplePreviewHint',
                      'Showing first {{count}} records',
                      { count: PREVIEW_SAMPLE_LIMIT }
                    )}
                  </span>
                </div>

                <Tabs defaultValue="vitals" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="vitals">
                      {t('settings.dataImport.clinical.vitalsTab', 'Vitals')} (
                      {preview.vitals.length})
                    </TabsTrigger>
                    <TabsTrigger value="labs">
                      {t('settings.dataImport.clinical.labsTab', 'Lab Results')}{' '}
                      ({preview.labs.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="vitals" className="mt-2">
                    {preview.vitals.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4 text-center">
                        {t(
                          'settings.dataImport.clinical.noVitals',
                          'No vitals found in document'
                        )}
                      </p>
                    ) : (
                      <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/40 text-left text-muted-foreground text-xs">
                              <th className="p-2.5 font-medium">
                                {t('common.date', 'Date')}
                              </th>
                              <th className="p-2.5 font-medium">
                                {t('common.type', 'Type')}
                              </th>
                              <th className="p-2.5 font-medium">
                                {t('common.value', 'Value')}
                              </th>
                              <th className="p-2.5 font-medium">
                                {t('common.unit', 'Unit')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.vitals
                              .slice(0, PREVIEW_SAMPLE_LIMIT)
                              .map((v: ParsedVital, idx: number) => (
                                <tr
                                  key={idx}
                                  className="border-b last:border-0 hover:bg-muted/20"
                                >
                                  <td className="p-2.5 text-xs text-muted-foreground">
                                    {v.isoDate}
                                  </td>
                                  <td className="p-2.5 capitalize">
                                    {v.kind.replace('_', ' ')}
                                  </td>
                                  <td className="p-2.5 font-medium">
                                    {v.value}
                                  </td>
                                  <td className="p-2.5 text-xs text-muted-foreground">
                                    {v.unit}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="labs" className="mt-2">
                    {preview.labs.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-4 text-center">
                        {t(
                          'settings.dataImport.clinical.noLabs',
                          'No lab results found in document'
                        )}
                      </p>
                    ) : (
                      <div className="rounded-md border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/40 text-left text-muted-foreground text-xs">
                              <th className="p-2.5 font-medium">
                                {t('common.date', 'Date')}
                              </th>
                              <th className="p-2.5 font-medium">
                                {t('labs.testName', 'Test Name')}
                              </th>
                              <th className="p-2.5 font-medium">
                                {t('common.value', 'Value')}
                              </th>
                              <th className="p-2.5 font-medium">
                                {t('labs.refRange', 'Ref Range')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.labs
                              .slice(0, PREVIEW_SAMPLE_LIMIT)
                              .map((l: ParsedLab, idx: number) => (
                                <tr
                                  key={idx}
                                  className="border-b last:border-0 hover:bg-muted/20"
                                >
                                  <td className="p-2.5 text-xs text-muted-foreground">
                                    {l.entryDate}
                                  </td>
                                  <td className="p-2.5 font-medium">
                                    {l.markerName}
                                  </td>
                                  <td className="p-2.5">
                                    {l.valueNumeric !== undefined
                                      ? l.valueNumeric
                                      : (l.valueText ?? '—')}{' '}
                                    <span className="text-xs text-muted-foreground">
                                      {l.unit || ''}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-xs text-muted-foreground">
                                    {l.refRangeLow !== undefined &&
                                    l.refRangeHigh !== undefined
                                      ? `${l.refRangeLow} - ${l.refRangeHigh} ${l.unit || ''}`
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 flex items-center justify-between sm:justify-between w-full">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          {preview && (
            <Button
              disabled={importing || totalSelectedCount === 0}
              onClick={handleImport}
            >
              {importing
                ? t('common.importing', 'Importing...')
                : t(
                    'settings.dataImport.clinical.importCountButton',
                    'Import {{count}} Records',
                    { count: totalSelectedCount }
                  )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClinicalRecordImportDialog;
