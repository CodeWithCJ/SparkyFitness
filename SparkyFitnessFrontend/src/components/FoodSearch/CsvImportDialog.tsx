import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import ImportFromCSV from '../../pages/Foods/FoodImportFromCSV.tsx';
import { useTranslation } from 'react-i18next';
import { FoodDataForBackend } from '@/types/food.ts';

interface CsvImportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    foodDataArray: FoodDataForBackend[],
    overwrite: boolean
  ) => Promise<void>;
}

export const CsvImportDialog = ({
  isOpen,
  onOpenChange,
  onSave,
}: CsvImportDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        requireConfirmation
        className="w-[95vw] max-w-[1600px] max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {t('enhancedFoodSearch.importFromCSV', 'Import from CSV')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'enhancedFoodSearch.importFromCSVDescription',
              'Import a CSV file to add multiple foods at once.'
            )}
          </DialogDescription>
        </DialogHeader>
        <ImportFromCSV onSave={onSave} />
      </DialogContent>
    </Dialog>
  );
};
