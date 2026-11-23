import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CSV_FIELD_DESCRIPTIONS,
  type CsvFieldDescription,
} from './csvFieldDescriptions';

interface CsvHeaderMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredHeaders: string[];
  fileHeaders: string[];
  headerMapping: Record<string, string>;
  onHeaderMappingChange: (next: Record<string, string>) => void;
  onConfirm: () => void;
  onCancel: () => void;
  // Only prompt on close while the importer's form is dirty (a file is loaded).
  // This dialog is only reachable with a file in hand, so it confirms then;
  // defaults to true to keep the historical always-confirm behavior.
  confirmWhen?: boolean;
  // Optional per-importer description map. Defaults to the shared
  // CSV_FIELD_DESCRIPTIONS; an importer passes a full map (e.g. Health's
  // HEALTH_CSV_FIELD_DESCRIPTIONS) when a field name means something different
  // there (Health's `unit` is a metric unit, not a food unit). A field absent
  // from the resolved map shows no description.
  fieldDescriptions?: Record<string, CsvFieldDescription>;
}

/**
 * Shared header-mapping dialog: shown when a file's columns don't match an
 * importer's required headers by name, so the user can manually pair each
 * required field with whichever file column actually holds it instead of
 * hard-failing the import. Originally only Health and Exercise DB had this
 * fallback; Food DB, Food Diary, and Workout History used to hard-fail on a
 * header mismatch with no recovery path.
 *
 * Cancelling does not clear the loaded file/text in the calling hook — the
 * "escape hatch back to the bar" is that adjusting the format bar
 * (delimiter especially) after Cancel re-runs the same match-or-map
 * decision against the same loaded text, since a wrong delimiter is a
 * common reason headers appeared not to match in the first place.
 */
const CsvHeaderMappingDialog = ({
  open,
  onOpenChange,
  requiredHeaders,
  fileHeaders,
  headerMapping,
  onHeaderMappingChange,
  onConfirm,
  onCancel,
  confirmWhen = true,
  fieldDescriptions = CSV_FIELD_DESCRIPTIONS,
}: CsvHeaderMappingDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        requireConfirmation
        confirmWhen={confirmWhen}
        className="max-w-4xl max-h-[80vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {t('csvImport.mapHeaders', 'Map CSV Headers')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t(
            'csvImport.mapHeadersDescription',
            "Your file's columns don't match the expected names. Pair each required field with the column that holds it, or Cancel and adjust the delimiter above if the columns above look wrong."
          )}
        </p>
        <div className="grid grid-cols-1 gap-4">
          {requiredHeaders.map((req) => {
            // The map doubles as the existence gate: a field it lacks (e.g. a
            // custom nutrient) shows no description. `t` translates, with the
            // map entry as the English fallback.
            const entry = fieldDescriptions[req];
            const description = entry
              ? t(entry.key, entry.fallback)
              : undefined;
            const descriptionId = description
              ? `csv-field-desc-${req.replace(/[^a-zA-Z0-9_-]/g, '_')}`
              : undefined;
            return (
              <div
                key={req}
                className="flex flex-col sm:flex-row sm:items-center gap-2"
              >
                {/* sm:w-48 (192px) fits the longest field label — `monounsaturated fat:`
                    (183px natural) minus the pr-3 gap — so the right-aligned labels
                    don't wrap and the dropdowns line up. Field names are untranslated
                    (stable identifiers), so the fixed width is safe across locales. */}
                <label className="font-medium capitalize sm:w-48 sm:text-right sm:pr-3">
                  {req.replace(/_/g, ' ')}:
                </label>
                <Select
                  value={headerMapping[req] || 'none'}
                  onValueChange={(val) =>
                    onHeaderMappingChange({
                      ...headerMapping,
                      [req]: val === 'none' ? '' : val,
                    })
                  }
                >
                  <SelectTrigger
                    className="w-full sm:w-50"
                    aria-describedby={descriptionId}
                  >
                    <SelectValue
                      placeholder={t('csvImport.selectHeader', 'Select header')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t('csvImport.none', 'None')}
                    </SelectItem>
                    {fileHeaders.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {description && (
                  <span
                    id={descriptionId}
                    className="text-xs text-muted-foreground sm:flex-1"
                  >
                    {description}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={onConfirm}>
            {t('csvImport.confirmMapping', 'Confirm')}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            {t('csvImport.cancel', 'Cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CsvHeaderMappingDialog;
