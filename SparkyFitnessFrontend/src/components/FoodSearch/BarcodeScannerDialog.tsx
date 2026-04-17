import { Suspense } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { DataProvider } from '@/types/settings.ts';
import { Database } from 'lucide-react';
import { lazyWithChunkRecovery } from '@/utils/chunkRecovery';

const BarcodeScanner = lazyWithChunkRecovery(
  () => import('./BarcodeScanner.tsx')
);

interface BarcodeScannerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onBarcodeDetected: (barcode: string) => void;
  selectedProviderId: string | null;
  onProviderChange: (providerId: string) => void;
  providers: DataProvider[];
}

export const BarcodeScannerDialog = ({
  isOpen,
  onOpenChange,
  onBarcodeDetected,
  selectedProviderId,
  onProviderChange,
  providers,
}: BarcodeScannerDialogProps) => {
  const { t } = useTranslation();

  const barcodeProviders = providers.filter(
    (provider) =>
      ['openfoodfacts', 'usda', 'fatsecret'].includes(provider.provider_type) &&
      provider.is_active
  );

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

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4 p-2 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t('enhancedFoodSearch.provider', 'Data Provider')}:
            </span>
          </div>
          <Select
            value={selectedProviderId || ''}
            onValueChange={onProviderChange}
          >
            <SelectTrigger className="w-full sm:w-[200px] bg-background">
              <SelectValue
                placeholder={t(
                  'enhancedFoodSearch.selectBarcodeProvider',
                  'Select Provider'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {barcodeProviders.length > 0 ? (
                barcodeProviders.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.provider_name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" disabled>
                  No active providers found
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

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
