import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import FormInput from '../../components/FormInput';
import Button from '../../components/ui/Button';

export const BARCODE_REGEX = /^\d{8,14}$/;

export function BarcodeField({
  value,
  onChange,
  onScan,
  textSecondary,
}: {
  value: string;
  onChange: (next: string) => void;
  onScan: () => void;
  textSecondary: string;
}) {
  const { t } = useTranslation();
  const trimmed = value.trim();
  const isInvalid = trimmed !== '' && !BARCODE_REGEX.test(trimmed);
  return (
    <View className="bg-surface rounded-xl p-4 gap-2 shadow-sm">
      <Text className="text-text-secondary text-sm font-medium">{t('foodMeals.barcode')}</Text>
      <FormInput
        placeholder="012345678905"
        keyboardType="number-pad"
        value={value}
        onChangeText={onChange}
        maxLength={14}
        autoCorrect={false}
        returnKeyType="done"
      />
      {isInvalid ? (
        <Text className="text-text-danger-subtle text-sm">
          {t('foodEditor.barcodeFormat')}
        </Text>
      ) : (
        <Text className="text-xs" style={{ color: textSecondary }}>
          {t('foodEditor.barcodeOptional')}
        </Text>
      )}
      <Button variant="ghost" onPress={onScan} className="self-start py-0 px-0">
        {t('foodEditor.scanCamera')}
      </Button>
    </View>
  );
}
