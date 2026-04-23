import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useCSSVariable, useUniwind } from 'uniwind';
import Button from './ui/Button';
import CollapsibleSection from './CollapsibleSection';
import StepperInput from './StepperInput';
import { formatRest } from './RestPeriodChip';

export const MIN_REST_SEC = 15;
export const MAX_REST_SEC = 900;
const REST_PRESETS: number[] = [30, 45, 60, 90, 120, 180, 300];

/** Clamp to [MIN, MAX] and round to the nearest 5 seconds. */
export function clampRestSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_REST_SEC;
  const clamped = Math.max(MIN_REST_SEC, Math.min(MAX_REST_SEC, seconds));
  return Math.round(clamped / 5) * 5;
}

export interface RestPeriodSheetRef {
  present: (currentSec: number | null | undefined) => void;
  dismiss: () => void;
}

interface RestPeriodSheetProps {
  onChange: (seconds: number) => void;
}

const RestPeriodSheet = forwardRef<RestPeriodSheetRef, RestPeriodSheetProps>(
  ({ onChange }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const { theme } = useUniwind();
    const [accentPrimary, surfaceBg, textMuted] = useCSSVariable([
      '--color-accent-primary',
      '--color-surface',
      '--color-text-muted',
    ]) as [string, string, string];
    const isDarkMode = theme === 'dark' || theme === 'amoled';

    const [currentValue, setCurrentValue] = useState<number>(90);
    const [customOpen, setCustomOpen] = useState(false);
    const [customText, setCustomText] = useState('90');

    useImperativeHandle(ref, () => ({
      present: (sec) => {
        const initial = clampRestSeconds(sec ?? 90);
        setCurrentValue(initial);
        setCustomText(String(initial));
        setCustomOpen(!REST_PRESETS.includes(initial));
        bottomSheetRef.current?.present();
      },
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    const commitPreset = useCallback(
      (seconds: number) => {
        onChange(seconds);
        bottomSheetRef.current?.dismiss();
      },
      [onChange],
    );

    const parsedCustom = useMemo(() => {
      const n = parseInt(customText, 10);
      return Number.isNaN(n) ? NaN : n;
    }, [customText]);

    const adjustCustom = (delta: number) => {
      const base = Number.isNaN(parsedCustom) ? currentValue : parsedCustom;
      const next = clampRestSeconds(base + delta);
      setCustomText(String(next));
    };

    const handleCustomChange = (text: string) => {
      // Only allow positive integer digits while typing.
      if (text === '' || /^\d+$/.test(text)) {
        setCustomText(text);
      }
    };

    const clampCustomOnBlur = () => {
      if (Number.isNaN(parsedCustom)) {
        setCustomText(String(currentValue));
        return;
      }
      const next = clampRestSeconds(parsedCustom);
      setCustomText(String(next));
    };

    const handleCustomSave = () => {
      const base = Number.isNaN(parsedCustom) ? currentValue : parsedCustom;
      const next = clampRestSeconds(base);
      onChange(next);
      bottomSheetRef.current?.dismiss();
    };

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          opacity={isDarkMode ? 0.7 : 0.5}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      [isDarkMode],
    );

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
        <BottomSheetView className="px-6 pb-8">
          <Text className="text-lg font-semibold text-text-primary text-center mb-4">
            Rest period
          </Text>

          <View className="flex-row flex-wrap justify-center" style={{ gap: 8 }}>
            {REST_PRESETS.map((preset) => {
              const selected = preset === currentValue;
              return (
                <TouchableOpacity
                  key={preset}
                  onPress={() => commitPreset(preset)}
                  activeOpacity={0.7}
                  className="rounded-full py-2 px-4 border"
                  style={{
                    backgroundColor: selected ? accentPrimary : 'transparent',
                    borderColor: selected ? accentPrimary : textMuted,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{ color: selected ? '#fff' : textMuted }}
                  >
                    {formatRest(preset)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <CollapsibleSection
            title="Custom"
            expanded={customOpen}
            onToggle={() => setCustomOpen((v) => !v)}
            itemCount={1}
          >
            <View className="py-3">
              <View className="flex-row items-center justify-center mb-3">
                <StepperInput
                  value={customText}
                  onChangeText={handleCustomChange}
                  onBlur={clampCustomOnBlur}
                  onDecrement={() => adjustCustom(-15)}
                  onIncrement={() => adjustCustom(15)}
                  keyboardType="number-pad"
                  InputComponent={BottomSheetTextInput}
                />
                <Text className="text-text-secondary text-base ml-3">
                  {formatRest(Number.isNaN(parsedCustom) ? currentValue : parsedCustom)}
                </Text>
              </View>
              <Button variant="primary" onPress={handleCustomSave}>
                Save
              </Button>
            </View>
          </CollapsibleSection>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

RestPeriodSheet.displayName = 'RestPeriodSheet';

export default RestPeriodSheet;
