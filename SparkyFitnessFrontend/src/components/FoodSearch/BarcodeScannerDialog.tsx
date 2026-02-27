import { Suspense, lazy } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

const BarcodeScanner = lazy(() => import('./BarcodeScanner.tsx'));

interface BarcodeScannerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onBarcodeDetected: (barcode: string) => void;
}

export const BarcodeScannerDialog = ({
  isOpen,
  onOpenChange,
  onBarcodeDetected,
}: BarcodeScannerDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('enhancedFoodSearch.scanBarcode', 'Scan Barcode')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'enhancedFoodSearch.scanBarcodeDescription',
              'Position the product barcode in front of your camera.'
            )}
          </DialogDescription>
        </DialogHeader>
        <Suspense fallback={<div>Loading camera module...</div>}>
          <BarcodeScanner
            onBarcodeDetected={onBarcodeDetected}
            onClose={() => onOpenChange(false)}
            isActive={isOpen}
            cameraFacing="back"
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
};
