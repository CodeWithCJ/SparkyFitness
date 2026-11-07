import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  labImportBody,
  planLabImport,
  isDayString,
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
import { generateClientId } from '@/utils/generateClientId';
import { toast } from '@/hooks/use-toast';
import {
  saveMayHaveLanded,
  useImportLabReport,
  useScanLabReport,
} from '@/hooks/Labs/useLabResults';
import {
  LAB_REPORT_ACCEPT,
  LAB_REPORT_MAX_FILE_BYTES,
  LAB_REPORT_MAX_PHOTO_BYTES,
  exactLabValue,
  formatLabRange,
  labNumber,
  labReportMimeType,
  readFileAsBase64,
} from './labFormat';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // Each picked file gets a number; a read or scan that finishes after a newer
  // pick (or a reset) is ignored, so its rows never replace the newer report's.
  const selection = useRef(0);

  const [rows, setRows] = useState<LabImportRow[] | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [labName, setLabName] = useState('');
  const [date, setDate] = useState(todayInZone(timezone));
  const [fileError, setFileError] = useState<string | null>(null);

  // One key per reviewed report, sent with every try to save it.
  const [requestId, setRequestId] = useState<string | null>(null);
  // After a save that may have been stored, the review is locked: a retry
  // must send exactly what was sent, or the server would return the earlier
  // report under the same key and drop the changes. Choosing the report again
  // starts a new review with a new key.
  const [locked, setLocked] = useState(false);

  const reset = () => {
    selection.current += 1;
    setRows(null);
    setIncluded({});
    setValues({});
    setLabName('');
    setFileError(null);
    setLocked(false);
    scan.reset();
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const id = ++selection.current;
    const stale = () => id !== selection.current;
    setFileError(null);
    const mimeType = labReportMimeType(file);
    if (
      mimeType.startsWith('image/') &&
      file.size > LAB_REPORT_MAX_PHOTO_BYTES
    ) {
      setFileError(
        t(
          'labs.import.photoTooLarge',
          'That photo is too large to read (limit 6 MB). Try a smaller photo or a screenshot.'
        )
      );
      return;
    }
    if (file.size > LAB_REPORT_MAX_FILE_BYTES) {
      setFileError(
        t(
          'labs.import.tooLarge',
          'That file is too large to read (limit 14 MB).'
        )
      );
      return;
    }
    let document: string;
    try {
      document = await readFileAsBase64(file);
    } catch {
      if (stale()) return;
      setFileError(t('labs.import.readFailed', 'Could not open that file.'));
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    if (stale()) return;
    try {
      const response: LabReportScanResponse = await scan.mutateAsync({
        document,
        mimeType,
      });
      if (stale()) return;
      const planned = planLabImport(
        response.report.results,
        markers,
        labels,
        sex
      );
      setRows(planned);
      // randomUUID needs HTTPS; generateClientId falls back to
      // getRandomValues, so a plain-HTTP self-host gets a key too. Without any
      // crypto it is not a UUID, and the import is sent without a key.
      const key = generateClientId();
      setRequestId(UUID_PATTERN.test(key) ? key : null);
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
    } catch (err) {
      // Reported here, not by a toast, so a scan the person has moved on from
      // (a newer pick, or the dialog closed) says nothing.
      if (!stale()) {
        const detail = err instanceof Error ? err.message : '';
        const message = t(
          'labs.import.scanFailed',
          'Could not read that report.'
        );
        setFileError(detail ? `${message} ${detail}` : message);
      }
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const chosen = (rows ?? []).filter(
    (row) => included[row.key] && row.blocked === null
  );
  // An untouched row keeps the scanned number exactly; an edited one is parsed.
  const parsed = Object.fromEntries(
    chosen.map((row) => [
      row.key,
      exactLabValue(values[row.key] ?? '', row.result.value),
    ])
  );
  const invalid = chosen.some((row) => parsed[row.key] === null);
  const badDate = !isDayString(date);
  const future = !badDate && date > todayInZone(timezone);

  const save = async () => {
    const body = labImportBody(chosen, {
      labName: labName.trim() || null,
      date,
      values: parsed as Record<string, number>,
      clientRequestId: requestId ?? undefined,
    });
    const id = selection.current;
    try {
      const saved = await importReport.mutateAsync(body);
      toast({
        title: t('labs.import.saved', {
          count: saved.results.length,
          defaultValue_one: 'Saved {{count}} result',
          defaultValue_other: 'Saved {{count}} results',
        }),
      });
      // A different report picked while this one was saving stays on screen.
      if (id === selection.current) close(false);
    } catch (error) {
      // The mutation's toast reports it; the review stays for another try.
      if (saveMayHaveLanded(error)) setLocked(true);
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
                  disabled={locked}
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
                  disabled={locked}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {badDate && (
                  <p role="alert" className="text-xs text-destructive">
                    {t('labs.dateInvalid', 'Enter the date of the test.')}
                  </p>
                )}
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

            {locked && requestId && (
              <p role="status" className="text-sm text-muted-foreground">
                {t(
                  'labs.import.lockedAfterFailedSave',
                  'Saving did not finish, so this review is locked: Save again sends exactly the same report, and it is stored only once. To change values, choose the report again.'
                )}
              </p>
            )}
            {locked && !requestId && (
              <p role="alert" className="text-sm text-destructive">
                {t(
                  'labs.import.unconfirmedNoKey',
                  'Saving did not finish, and this browser cannot mark the report so that saving again stores it once. The report may still be saving. Close this window and check your lab results in a few minutes before importing anything again, so it is not saved twice.'
                )}
              </p>
            )}
            <ul className="divide-y rounded-md border">
              {rows.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-wrap items-center gap-3 p-3"
                >
                  <Checkbox
                    checked={!!included[row.key] && row.blocked === null}
                    disabled={locked || row.blocked !== null}
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
                      {formatLabRange(row.range.low, row.range.high, '')}
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
                    disabled={locked || row.blocked !== null}
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
                // Without a key a retry could store the report twice.
                (locked && !requestId) ||
                invalid ||
                badDate ||
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
