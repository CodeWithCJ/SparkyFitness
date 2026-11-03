import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  labImportBody,
  parseLabValue,
  planLabImport,
  todayInZone,
  type LabImportRow,
  type LabMarker,
  type LabMarkerLabels,
  type LabReportScanResponse,
  type LabSex,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import {
  useImportLabReport,
  useScanLabReport,
} from '@/hooks/Labs/useLabResults';
import {
  LAB_REPORT_ACCEPT,
  LAB_REPORT_MAX_FILE_BYTES,
  labNumber,
  readFileAsBase64,
} from './labFormat';

interface LabImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markers: LabMarker[];
  labels: LabMarkerLabels;
  sex: LabSex | null;
}

const LabImportDialog = ({
  open,
  onOpenChange,
  markers,
  labels,
  sex,
}: LabImportDialogProps) => {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const scan = useScanLabReport();
  const importReport = useImportLabReport();
  const fileInput = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<LabImportRow[] | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [labName, setLabName] = useState('');
  const [date, setDate] = useState(todayInZone(timezone));
  const [fileError, setFileError] = useState<string | null>(null);

  const reset = () => {
    setRows(null);
    setIncluded({});
    setValues({});
    setLabName('');
    setFileError(null);
    scan.reset();
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    if (file.size > LAB_REPORT_MAX_FILE_BYTES) {
      setFileError(
        t(
          'labs.import.tooLarge',
          'That file is too large to read (limit 14 MB).'
        )
      );
      return;
    }
    try {
      const document = await readFileAsBase64(file);
      const response: LabReportScanResponse = await scan.mutateAsync({
        document,
        mimeType: file.type,
      });
      const planned = planLabImport(
        response.report.results,
        markers,
        labels,
        sex
      );
      setRows(planned);
      setIncluded(
        Object.fromEntries(planned.map((r) => [r.key, r.blocked === null]))
      );
      setValues(
        Object.fromEntries(
          planned.map((r) => [r.key, labNumber(r.result.value)])
        )
      );
      setLabName(response.report.lab_name ?? '');
      setDate(response.report.collected_on ?? todayInZone(timezone));
    } catch {
      // The mutation's toast reports it.
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const chosen = (rows ?? []).filter(
    (row) => included[row.key] && row.blocked === null
  );
  const parsed = Object.fromEntries(
    chosen.map((row) => [row.key, parseLabValue(values[row.key] ?? '')])
  );
  const invalid = chosen.some((row) => parsed[row.key] === null);
  const future = date > todayInZone(timezone);

  const save = async () => {
    const body = labImportBody(chosen, {
      labName: labName.trim() || null,
      date,
      values: parsed as Record<string, number>,
    });
    try {
      const saved = await importReport.mutateAsync(body);
      toast({
        title: t('labs.import.saved', {
          count: saved.results.length,
          defaultValue_one: 'Saved {{count}} result',
          defaultValue_other: 'Saved {{count}} results',
        }),
      });
      close(false);
    } catch {
      // The mutation's toast reports it; the review stays for another try.
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('labs.import.cta', 'Import from a report')}
          </DialogTitle>
          <DialogDescription>
            {rows
              ? t(
                  'labs.import.editHintWeb',
                  'Check the values against your report. Each result is saved with the unit and reference range the report printed.'
                )
              : t(
                  'labs.import.introWeb',
                  'Choose a lab report PDF, or a photo or screenshot of one. Your AI provider reads it and you review the results before anything is saved. The report itself is not stored.'
                )}
          </DialogDescription>
        </DialogHeader>

        {!rows && (
          <div className="space-y-3">
            <input
              ref={fileInput}
              type="file"
              accept={LAB_REPORT_ACCEPT}
              className="hidden"
              data-testid="lab-report-file"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={scan.isPending}
            >
              {scan.isPending
                ? t('labs.import.reading', 'Reading your report...')
                : t('labs.import.chooseFile', 'Choose a PDF or photo')}
            </Button>
            {fileError && (
              <p role="alert" className="text-sm text-destructive">
                {fileError}
              </p>
            )}
          </div>
        )}

        {rows && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="import-lab">{t('labs.labName', 'Lab')}</Label>
                <Input
                  id="import-lab"
                  value={labName}
                  onChange={(e) => setLabName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="import-date">
                  {t('labs.date', 'Date of test')}
                </Label>
                <Input
                  id="import-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {future && (
                  <p role="alert" className="text-xs text-destructive">
                    {t(
                      'labs.dateFuture',
                      'The test date cannot be in the future.'
                    )}
                  </p>
                )}
              </div>
            </div>

            <ul className="divide-y rounded-md border">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-wrap items-center gap-3 p-3"
                >
                  <Checkbox
                    checked={!!included[row.key] && row.blocked === null}
                    disabled={row.blocked !== null}
                    onCheckedChange={(on) =>
                      setIncluded((prev) => ({
                        ...prev,
                        [row.key]: on === true,
                      }))
                    }
                    aria-label={t(
                      'labs.import.includeRow',
                      'Include {{name}}',
                      {
                        name: row.title,
                      }
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{row.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.target.kind === 'custom' && !row.target.existing && (
                        <span>
                          {t('labs.import.newMarker', 'New marker')} ·{' '}
                        </span>
                      )}
                      {row.range.low !== null || row.range.high !== null
                        ? `${row.range.low !== null ? labNumber(row.range.low) : ''} - ${row.range.high !== null ? labNumber(row.range.high) : ''}`
                        : null}
                    </div>
                    {row.blocked === 'duplicate' && (
                      <p className="text-xs text-destructive">
                        {t(
                          'labs.import.blocked.duplicate',
                          'Already included from this report.'
                        )}
                      </p>
                    )}
                    {row.warning === 'unit_differs' && (
                      <p className="text-xs text-amber-600">
                        {t(
                          'labs.import.warning.unit',
                          'Your earlier results use {{earlierUnit}}, but this report uses {{reportUnit}}. Units are not converted.',
                          { earlierUnit: row.earlierUnit, reportUnit: row.unit }
                        )}
                      </p>
                    )}
                  </div>
                  <Input
                    className="w-28"
                    inputMode="decimal"
                    disabled={row.blocked !== null}
                    value={values[row.key] ?? ''}
                    aria-label={t(
                      'labs.import.valueFor',
                      'Result for {{name}}',
                      {
                        name: row.title,
                      }
                    )}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [row.key]: e.target.value,
                      }))
                    }
                  />
                  <span className="w-20 text-sm text-muted-foreground">
                    {row.unit}
                  </span>
                </li>
              ))}
            </ul>
            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'labs.import.nothingFound',
                  'No results were found in that report.'
                )}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {rows && (
            <Button variant="outline" onClick={reset}>
              {t('labs.import.chooseAnother', 'Choose a different report')}
            </Button>
          )}
          {rows && (
            <Button
              onClick={() => void save()}
              disabled={
                chosen.length === 0 ||
                invalid ||
                future ||
                importReport.isPending
              }
            >
              {t('labs.import.saveCount', {
                count: chosen.length,
                defaultValue_one: 'Save {{count}} result',
                defaultValue_other: 'Save {{count}} results',
              })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LabImportDialog;
