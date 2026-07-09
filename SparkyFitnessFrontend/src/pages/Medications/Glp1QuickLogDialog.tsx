import { useTranslation } from 'react-i18next';
import { Syringe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import InjectionSitePicker from './InjectionSitePicker';
import { useInjectionSiteSelection } from '@/hooks/useInjectionSiteSelection';
import type { Medication } from '@/types/medications';

interface Glp1QuickLogDialogProps {
  med: Medication;
  /** Called with the confirmed site, or null when the user skips site capture. */
  onConfirm: (site: string | null) => void;
  onClose: () => void;
  isPending: boolean;
}

/**
 * Compact site prompt shown when logging a GLP-1 injectable from the Log tab.
 * Shares its picker (suggestion, rotation, warnings) with the Cabinet's
 * Glp1LogInjection form; the rotation-suggested site is pre-selected so the
 * fast path is a single tap. Pen deduction is resolved server-side either way.
 */
export default function Glp1QuickLogDialog({
  med,
  onConfirm,
  onClose,
  isPending,
}: Glp1QuickLogDialogProps) {
  const { t } = useTranslation();
  const siteSelection = useInjectionSiteSelection(med.id);
  const { site } = siteSelection;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Syringe className="h-4 w-4 text-blue-500" />
            {t('medications.glp1.quickLogTitle', 'Where did you inject?')}
          </DialogTitle>
        </DialogHeader>
        <div className="py-1">
          <p className="mb-3 text-xs text-muted-foreground">
            {t('medications.glp1.quickLogHint', {
              defaultValue:
                '{{name}} — the dose is deducted from your active pen automatically. Green = suggested rotation site.',
              name: med.display_name || med.name,
            })}
          </p>
          <InjectionSitePicker selection={siteSelection} />
        </div>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={() => onConfirm(null)}
            disabled={isPending}
          >
            {t('medications.glp1.skipSite', 'Skip site')}
          </Button>
          <Button onClick={() => onConfirm(site)} disabled={!site || isPending}>
            {isPending
              ? t('medications.common.logging', 'Logging…')
              : t('medications.glp1.logInjection', 'Log injection')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
