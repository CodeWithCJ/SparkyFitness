import { useTranslation } from 'react-i18next';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, Text } from 'react-native';
import Button from './ui/Button';
import { useSheetBackdrop, useSheetHardwareBack } from './ui/sheetChrome';
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
}

// How far one +/- press moves the typed amount, per display unit.
const AMOUNT_STEP: Record<string, number> = {
  ml: 50,
  oz: 2,
  liter: 0.1,
};

// Decimal places of a plain numeric literal (e.g. a step constant), with no
// locale separator handling -- the step constants above are always '.'.
function decimalPlacesOfLiteral(value: number): number {
  const dotIndex = value.toString().indexOf('.');
  return dotIndex === -1 ? 0 : value.toString().length - dotIndex - 1;
}

// Decimal places the user actually typed, '.' or ',' alike.
function decimalPlacesOfText(text: string): number {
  const match = text.match(/[.,](\d+)$/);
  return match ? match[1].length : 0;
}

// +/- stepping through a float step (liter's 0.1) accumulates binary
// floating-point artifacts (0.1 three times is 0.30000000000000004).
// Rounding to the finer of the step's own precision and what the user had
// typed clears that without flattening a value like 0.25 to one decimal.
function roundStepResult(
  value: number,
  amountText: string,
  step: number
): number {
  const decimals = Math.max(
    decimalPlacesOfText(amountText),
    decimalPlacesOfLiteral(step)
  );
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const CustomWaterAmountSheet = forwardRef<
  CustomWaterAmountSheetRef,
  CustomWaterAmountSheetProps
>(({ unit, onSubmit }, ref) => {
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

  const [isOpen, setIsOpen] = useState(false);

  // A synchronous latch, not state: two Log presses can both fire before the
  // sheet's dismiss animation finishes, and each would mint its own
  // `client_id`, so replay dedup on the server does not catch the second one.
  const submittedRef = useRef(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useImperativeHandle(ref, () => ({
    present: () => {
      setAmountText('0');
      submittedRef.current = false;
      setIsSubmitted(false);
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
    const next = Math.max(0, roundStepResult(amount + delta, amountText, step));
    setAmountText(String(next));
  };

  const handleLog = () => {
    if (amount <= 0 || submittedRef.current) return;
    submittedRef.current = true;
    setIsSubmitted(true);
    onSubmit(volumeToMl(amount, unit));
    bottomSheetRef.current?.dismiss();
  };

  // Track the open state so Android's hardware Back can dismiss the sheet
  // instead of falling through to navigation. Set from both onAnimate and
  // onChange (the library drops onAnimate when the open finishes before it
  // reaches JS), cleared only in onDismiss.
  const markOpen = useCallback(() => setIsOpen(true), []);
  const handleAnimate = useCallback(
    (_fromIndex: number, toIndex: number) => {
      if (toIndex >= 0) markOpen();
    },
    [markOpen]
  );
  const handleChange = useCallback(
    (index: number) => {
      if (index >= 0) markOpen();
    },
    [markOpen]
  );
  const handleDismiss = useCallback(() => setIsOpen(false), []);

  useSheetHardwareBack(isOpen, () => bottomSheetRef.current?.dismiss());

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
      onAnimate={handleAnimate}
      onChange={handleChange}
      onDismiss={handleDismiss}
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
          disabled={amount <= 0 || isSubmitted}
        >
          {t('waterIntake.logAmount', { defaultValue: 'Log' })}
        </Button>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

CustomWaterAmountSheet.displayName = 'CustomWaterAmountSheet';

export default CustomWaterAmountSheet;
