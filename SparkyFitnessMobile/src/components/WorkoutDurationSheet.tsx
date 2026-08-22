import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import { useSheetBackdrop } from './ui/sheetChrome';
import StepperInput from './StepperInput';
import { formatDuration } from '../utils/workoutSession';

export interface WorkoutDurationSheetRef {
  /** Open prefilled with `initialMinutes`, capped at `maxMinutes`. */
  present: (initialMinutes: number, maxMinutes: number) => void;
  dismiss: () => void;
}

interface WorkoutDurationSheetProps {
  onSave: (minutes: number) => void;
}

/**
 * Custom editor for the end-of-workout "adjust duration" prompt: pick how many
 * minutes the workout counts as, capped at its wall-clock span. The value in
 * minutes; exercise duration and burned calories derive from it.
 */
const WorkoutDurationSheet = forwardRef<WorkoutDurationSheetRef, WorkoutDurationSheetProps>(
  ({ onSave }, ref) => {
    const { t } = useTranslation();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [surfaceBg, textMuted] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
    ]) as [string, string];

    const [currentValue, setCurrentValue] = useState<number>(60);
    const [maxMinutes, setMaxMinutes] = useState<number>(60);
    const [text, setText] = useState('60');

    const clampMinutes = useCallback((minutes: number, max: number) => {
      if (!Number.isFinite(minutes)) return 1;
      return Math.max(1, Math.min(max, Math.round(minutes)));
    }, []);

    useImperativeHandle(ref, () => ({
      present: (initialMinutes, max) => {
        const boundedMax = Math.max(1, Math.floor(max));
        const initial = clampMinutes(initialMinutes, boundedMax);
        setMaxMinutes(boundedMax);
        setCurrentValue(initial);
        setText(String(initial));
        bottomSheetRef.current?.present();
      },
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    const parsed = useMemo(() => {
      const n = parseInt(text, 10);
      return Number.isNaN(n) ? NaN : n;
    }, [text]);

    const adjust = (delta: number) => {
      const base = Number.isNaN(parsed) ? currentValue : parsed;
      setText(String(clampMinutes(base + delta, maxMinutes)));
    };

    const handleTextChange = (value: string) => {
      // Only allow positive integer digits while typing.
      if (value === '' || /^\d+$/.test(value)) {
        setText(value);
      }
    };

    const clampOnBlur = () => {
      if (Number.isNaN(parsed)) {
        setText(String(currentValue));
        return;
      }
      setText(String(clampMinutes(parsed, maxMinutes)));
    };

    const handleSave = () => {
      const base = Number.isNaN(parsed) ? currentValue : parsed;
      onSave(clampMinutes(base, maxMinutes));
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
          <Text className="text-lg font-semibold text-text-primary text-center mb-1">
            {t('workout.durationTitle', { defaultValue: 'Workout duration' })}
          </Text>
          <Text className="text-sm text-text-muted text-center mb-4">
            {t('workout.durationDescription', { defaultValue: 'Minutes this workout counts as, up to its {{span}} span.', span: formatDuration(maxMinutes) })}
          </Text>

          <View className="flex-row items-center justify-center mb-3">
            <StepperInput
              value={text}
              onChangeText={handleTextChange}
              onBlur={clampOnBlur}
              onDecrement={() => adjust(-5)}
              onIncrement={() => adjust(5)}
              keyboardType="number-pad"
              InputComponent={BottomSheetTextInput}
            />
            <Text className="text-text-secondary text-base ml-3">
              {formatDuration(Number.isNaN(parsed) ? currentValue : parsed)}
            </Text>
          </View>
          <Button variant="primary" onPress={handleSave}>
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

WorkoutDurationSheet.displayName = 'WorkoutDurationSheet';

export default WorkoutDurationSheet;
