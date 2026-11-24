import { useTranslation } from 'react-i18next';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Button from './ui/Button';
import { useSheetBackdrop } from './ui/sheetChrome';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import StepperInput from './StepperInput';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import { volumeToMl, WATER_UNIT_LABELS } from '../utils/unitConversions';

export interface CustomWaterAmountSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface CustomWaterAmountSheetProps {
  /** The caller's resolved water display unit; the typed amount is in this unit. */
  unit: string;
  onSubmit: (waterMl: number) => void;
  isPending?: boolean;
}

// How far one +/- press moves the typed amount, per display unit.
const AMOUNT_STEP: Record<string, number> = {
  ml: 50,
  oz: 2,
  liter: 0.1,
};

const CustomWaterAmountSheet = forwardRef<
  CustomWaterAmountSheetRef,
  CustomWaterAmountSheetProps
>(({ unit, onSubmit, isPending }, ref) => {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [amountText, setAmountText] = useState('0');
  const [surfaceBg, textMuted] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
  ]) as [string, string];

  const amount = parseDecimalInput(amountText) || 0;
  const unitLabel = WATER_UNIT_LABELS[unit] ?? unit;
  const step = AMOUNT_STEP[unit] ?? AMOUNT_STEP.ml;

  useImperativeHandle(ref, () => ({
    present: () => {
      setAmountText('0');
      bottomSheetRef.current?.present();
    },
    dismiss: () => {
      bottomSheetRef.current?.dismiss();
    },
  }));

  const updateAmountText = (text: string) => {
    if (DECIMAL_INPUT_REGEX.test(text)) {
      setAmountText(text);
    }
  };

  const adjustAmount = (delta: number) => {
    setAmountText(String(Math.max(0, amount + delta)));
  };

  const handleLog = () => {
    if (amount <= 0) return;
    onSubmit(volumeToMl(amount, unit));
    bottomSheetRef.current?.dismiss();
  };

  const renderBackdrop = useSheetBackdrop();

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustPan"
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: surfaceBg }}
      handleIndicatorStyle={{ backgroundColor: textMuted }}
    >
      <BottomSheetView className="px-6 pb-safe-or-8">
        <View className="items-center mb-5">
          <Text className="text-text-primary text-lg font-semibold text-center">
            {t('waterIntake.customAmountTitle', {
              defaultValue: 'Log a custom amount',
            })}
          </Text>
        </View>

        <View className="items-center mb-6">
          <View className="flex-row items-center">
            <StepperInput
              value={amountText}
              onChangeText={updateAmountText}
              onDecrement={() => adjustAmount(-step)}
              onIncrement={() => adjustAmount(step)}
              InputComponent={BottomSheetTextInput}
              inputProps={{ testID: 'custom-water-amount-input' }}
            />
            <Text className="text-text-secondary text-lg ml-3">
              {unitLabel}
            </Text>
          </View>
        </View>

        <Button
          variant="primary"
          onPress={handleLog}
          disabled={isPending || amount <= 0}
        >
          {isPending
            ? t('common.saving', { defaultValue: 'Saving…' })
            : t('waterIntake.logAmount', { defaultValue: 'Log' })}
        </Button>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

CustomWaterAmountSheet.displayName = 'CustomWaterAmountSheet';

export default CustomWaterAmountSheet;
