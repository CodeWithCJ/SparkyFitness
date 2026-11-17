import { Suspense, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import { DataProvider } from '@/types/settings.ts';
import type { Food } from '@/types/food';
import { Database } from 'lucide-react';
import { lazyWithChunkRecovery } from '@/utils/chunkRecovery';
import { BarcodeImageInput } from './BarcodeImageInput';
import { NutritionLabelImageInput } from './NutritionLabelImageInput';

const BarcodeScanner = lazyWithChunkRecovery(
  () => import('./BarcodeScanner.tsx')
);

interface BarcodeScannerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onBarcodeDetected: (barcode: string) => void;
  selectedProviderId?: string | null;
  onProviderChange?: (providerId: string) => void;
  providers?: DataProvider[];
  hideProvider?: boolean;
  hideManualInput?: boolean;
  /**
   * Adds a Nutrition label tab that reads a label photo and passes the values
   * on as an unsaved food. Without it the dialog only reads barcodes.
   */
  onLabelScanned?: (food: Food) => void;
}

type ScanMode = 'barcode' | 'label';

export const BarcodeScannerDialog = ({
  isOpen,
  onOpenChange,
  onBarcodeDetected,
  selectedProviderId,
  onProviderChange,
  providers = [],
  hideProvider = false,
  hideManualInput = false,
  onLabelScanned,
}: BarcodeScannerDialogProps) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ScanMode>('barcode');
  const showLabel = !!onLabelScanned && mode === 'label';

  const barcodeProviders = providers.filter(
    (provider) =>
      ['openfoodfacts', 'usda', 'fatsecret', 'yazio'].includes(
        provider.provider_type
      ) && provider.is_active
  );

  const barcodeContent = (
    <>
      {!hideProvider && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-4 p-2 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t('enhancedFoodSearch.dataProvider', 'Data Provider:')}
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
                  {t(
                    'foodSearch.barcodeScannerDialog.noActiveProvidersFound',
                    'No active providers found'
                  )}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mb-4">
        <BarcodeImageInput onBarcodeDetected={onBarcodeDetected} />
      </div>

      <Suspense
        fallback={
          <div>
            {t(
              'foodSearch.barcodeScannerDialog.loadingCameraModule',
              'Loading camera module...'
            )}
          </div>
        }
      >
        <BarcodeScanner
          onBarcodeDetected={onBarcodeDetected}
          onClose={() => onOpenChange(false)}
          isActive={isOpen}
          cameraFacing="back"
          hideManualInput={hideManualInput}
        />
      </Suspense>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {showLabel
              ? t(
                  'foodSearch.nutritionLabelImage.title',
                  'Scan Nutrition Label'
                )
              : t('enhancedFoodSearch.scanBarcode', 'Scan Barcode')}
          </DialogTitle>
          <DialogDescription>
            {showLabel
              ? t(
                  'foodSearch.nutritionLabelImage.dialogDescription',
                  'Create a food from a picture of its nutrition label.'
                )
              : t(
                  'enhancedFoodSearch.scanBarcodeDescription',
                  'Position the product barcode in front of your camera, or use a picture of it.'
                )}
          </DialogDescription>
        </DialogHeader>

        {onLabelScanned && (
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as ScanMode)}
          >
            <TabsList className="w-full">
              <TabsTrigger value="barcode">
                {t('foodSearch.scanModes.barcode', 'Barcode')}
              </TabsTrigger>
              <TabsTrigger value="label">
                {t('foodSearch.scanModes.label', 'Nutrition label')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="barcode">{barcodeContent}</TabsContent>
            <TabsContent value="label">
              <NutritionLabelImageInput onLabelScanned={onLabelScanned} />
            </TabsContent>
          </Tabs>
        )}

        {!onLabelScanned && barcodeContent}
      </DialogContent>
    </Dialog>
  );
};
