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

interface CsvHeaderMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredHeaders: string[];
  fileHeaders: string[];
  headerMapping: Record<string, string>;
  onHeaderMappingChange: (next: Record<string, string>) => void;
  onConfirm: () => void;
  onCancel: () => void;
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
}: CsvHeaderMappingDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        requireConfirmation
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
          {requiredHeaders.map((req) => (
            <div
              key={req}
              className="flex flex-col sm:flex-row sm:items-center gap-2"
            >
              <label className="font-medium capitalize">
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
                <SelectTrigger className="w-full sm:w-50">
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
            </div>
          ))}
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
