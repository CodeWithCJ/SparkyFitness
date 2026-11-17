import { useTranslation } from 'react-i18next';
import Button from '../../components/ui/Button';
import type { FoodFormScreenProps } from '../FoodFormScreen';

interface ScanNutritionLabelButtonProps {
  navigation: FoodFormScreenProps['navigation'];
  returnKey: string;
  disabled: boolean;
}

export function ScanNutritionLabelButton({
  navigation,
  returnKey,
  disabled,
}: ScanNutritionLabelButtonProps) {
  const { t } = useTranslation();

  return (
    <Button
      variant="secondary"
      disabled={disabled}
      className="mb-4"
      onPress={() =>
        navigation.navigate('FoodScan', { mode: 'capture-label', returnKey })
      }
    >
      {t('foodForm.scanNutritionLabel', {
        defaultValue: 'Scan nutrition label',
      })}
    </Button>
  );
}
