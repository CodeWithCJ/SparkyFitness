import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { dateTypeToDate } from './TimeSheet';
import Toast from 'react-native-toast-message';
import { useAppLocale } from '../localization';

import Button from './ui/Button';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import Icon from './Icon';
import StepperInput from './StepperInput';
import { useStartFast } from '../hooks/useFasting';
import {
  FASTING_PRESETS,
  DEFAULT_PRESET_ID,
  CUSTOM_PRESET_ID,
} from '../constants/fasting';
import { addLog } from '../services/LogService';

const MS_PER_HOUR = 1000 * 60 * 60;
const MIN_CUSTOM_HOURS = 1;
const MAX_CUSTOM_HOURS = 72;
const DEFAULT_CUSTOM_HOURS = 12;

/** Normalizes the picker's 6-way `DateType` into a JS `Date`, preserving time. */
export interface FastingProtocolSheetRef {
  present: (initialPresetId?: string) => void;
  dismiss: () => void;
}


function getPresetCopy(t: (key: string, options?: Record<string, unknown>) => string, id: string, field: 'name' | 'description', fallback: string): string {
  switch (`${id}.${field}`) {
    case '16-8.name': return t('fastingProtocol.presets.leangains.name', { defaultValue: '16:8 Leangains' });
    case '16-8.description': return t('fastingProtocol.presets.leangains.description', { defaultValue: 'Skip breakfast and eat during an 8-hour window.' });
    case '18-6.name': return t('fastingProtocol.presets.warrior18.name', { defaultValue: '18:6 Warrior' });
    case '18-6.description': return t('fastingProtocol.presets.warrior18.description', { defaultValue: 'More aggressive fast with a 6-hour eating window.' });
    case '20-4.name': return t('fastingProtocol.presets.warrior20.name', { defaultValue: '20:4 Warrior' });
    case '20-4.description': return t('fastingProtocol.presets.warrior20.description', { defaultValue: 'Eat one large meal or spread calories over 4 hours.' });
    case 'circumadian.name': return t('fastingProtocol.presets.circadian.name', { defaultValue: 'Circadian Rhythm' });
    case 'circumadian.description': return t('fastingProtocol.presets.circadian.description', { defaultValue: 'Fast from sunset to morning.' });
    case 'custom.name': return t('fastingProtocol.presets.custom.name', { defaultValue: 'Custom Fast' });
    case 'custom.description': return t('fastingProtocol.presets.custom.description', { defaultValue: 'Set your own fasting duration.' });
    default: return fallback;
  }
}

const FastingProtocolSheet = forwardRef<FastingProtocolSheetRef>((_props, ref) => {
  const { t } = useTranslation();
  const appLocale = useAppLocale();
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  const [surfaceBg, textMuted, accentPrimary, textPrimary, textSecondary] = useCSSVariable([
    '--color-surface',
    '--color-text-muted',
    '--color-accent-primary',
    '--color-text-primary',
    '--color-text-secondary',
  ]) as [string, string, string, string, string];

  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [customHours, setCustomHours] = useState<string>(String(DEFAULT_CUSTOM_HOURS));

  const { mutate: startFast, isPending } = useStartFast();

  useImperativeHandle(ref, () => ({
    present: (initialPresetId) => {
      setSelectedPresetId(
        initialPresetId && FASTING_PRESETS.some((p) => p.id === initialPresetId)
          ? initialPresetId
          : DEFAULT_PRESET_ID,
      );
      setStartDate(new Date());
      setShowStartPicker(false);
      setCustomHours(String(DEFAULT_CUSTOM_HOURS));
      bottomSheetRef.current?.present();
    },
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useSheetBackdrop();

  const handleStartChange = useCallback(({ date }: { date: DateType }) => {
    const js = dateTypeToDate(date);
    if (js && !Number.isNaN(js.getTime())) setStartDate(js);
  }, []);

  const isCustom = selectedPresetId === CUSTOM_PRESET_ID;
  const parsedCustomHours = useMemo(() => {
    const n = parseInt(customHours, 10);
    return Number.isNaN(n) ? NaN : n;
  }, [customHours]);

  const adjustCustom = (delta: number) => {
    const base = Number.isNaN(parsedCustomHours) ? DEFAULT_CUSTOM_HOURS : parsedCustomHours;
    const next = Math.max(MIN_CUSTOM_HOURS, Math.min(MAX_CUSTOM_HOURS, base + delta));
    setCustomHours(String(next));
  };

  const handleCustomChange = (text: string) => {
    if (text === '' || /^\d+$/.test(text)) setCustomHours(text);
  };

  const customValid =
    !isCustom ||
    (!Number.isNaN(parsedCustomHours) &&
      parsedCustomHours >= MIN_CUSTOM_HOURS &&
      parsedCustomHours <= MAX_CUSTOM_HOURS);

  const startLabel = useMemo(
    () =>
      startDate.toLocaleString(appLocale, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [appLocale, startDate],
  );

  const handleStart = () => {
    const preset = FASTING_PRESETS.find((p) => p.id === selectedPresetId);
    if (!preset || !customValid) return;

    const fastingHours = isCustom ? parsedCustomHours : preset.fastingHours;
    const start = startDate;
    const target = new Date(start.getTime() + fastingHours * MS_PER_HOUR);

    startFast(
      {
        startTime: start.toISOString(),
        targetEndTime: target.toISOString(),
        fastingType: preset.name,
      },
      {
        onSuccess: () => {
          bottomSheetRef.current?.dismiss();
          Toast.show({ type: 'success', text1: t('fastingProtocol.fastStarted', { defaultValue: 'Fast started' }) });
        },
        onError: (error) => {
          addLog(`Failed to start fast: ${error}`, 'ERROR');
          Toast.show({
            type: 'error',
            text1: t('fastingProtocol.failedStart', { defaultValue: 'Failed to start fast' }),
            text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
          });
        },
      },
    );
  };

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustPan"
      // On Android the sheet's content pan gesture steals vertical drags from
      // the time picker's wheels (plain FlatLists), so content panning stays
      // off there. Must be static: toggling this prop swaps the sheet's
      // content wrapper component, remounting the content and dismissing the
      // modal.
      enableContentPanningGesture={Platform.OS !== 'android'}
      backdropComponent={renderBackdrop}
      containerComponent={sheetContainer}
      backgroundStyle={{ backgroundColor: surfaceBg }}
      handleIndicatorStyle={{ backgroundColor: textMuted }}
    >
      {/* bg-surface is a touch shield, not decoration: with content panning off
          on Android, gesture-handler lets taps on background-less views fall
          through to the backdrop's tap-to-close. A background makes this
          container absorb them. */}
      <BottomSheetScrollView contentContainerClassName="bg-surface px-5 pb-safe-or-8">
        <Text className="text-lg font-semibold text-text-primary text-center mb-4">
          {t('fastingProtocol.startTitle', { defaultValue: 'Start a fast' })}
        </Text>

        {/* Protocol list */}
        {FASTING_PRESETS.map((preset) => {
          const selected = preset.id === selectedPresetId;
          return (
            <TouchableOpacity
              key={preset.id}
              onPress={() => setSelectedPresetId(preset.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={getPresetCopy(t, preset.id, 'name', preset.name)}
              activeOpacity={0.7}
              className={`rounded-xl p-3 mb-2 border ${
                selected ? 'bg-accent-primary/10 border-accent-primary' : 'bg-raised border-border-subtle'
              }`}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-text-primary">{getPresetCopy(t, preset.id, 'name', preset.name)}</Text>
                {preset.id !== CUSTOM_PRESET_ID && (
                  <Text className="text-sm font-medium" style={{ color: accentPrimary }}>
                    {preset.fastingHours}:{preset.eatingHours}
                  </Text>
                )}
              </View>
              <Text className="text-sm text-text-secondary mt-0.5">{getPresetCopy(t, preset.id, 'description', preset.description)}</Text>

              {/* Custom duration input */}
              {selected && preset.id === CUSTOM_PRESET_ID && (
                <View className="flex-row items-center mt-3">
                  <StepperInput
                    value={customHours}
                    onChangeText={handleCustomChange}
                    onDecrement={() => adjustCustom(-1)}
                    onIncrement={() => adjustCustom(1)}
                    keyboardType="number-pad"
                    InputComponent={BottomSheetTextInput}
                    accessibilityLabels={{
                      decrement: t('fastingProtocol.accessibility.decreaseHours', { defaultValue: 'Decrease fasting duration' }),
                      input: t('fastingProtocol.accessibility.durationHours', { defaultValue: 'Fasting duration in hours' }),
                      increment: t('fastingProtocol.accessibility.increaseHours', { defaultValue: 'Increase fasting duration' }),
                    }}
                  />
                  <Text className="text-text-secondary text-base ml-3">{t('fastingProtocol.hourFast', { defaultValue: 'hour fast' })}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Start-time adjust */}
        <TouchableOpacity
          onPress={() => setShowStartPicker((v) => !v)}
          activeOpacity={0.7}
          className="flex-row items-center justify-between py-3 mt-1"
          accessibilityRole="button"
          accessibilityLabel={t('fastingProtocol.accessibility.startTime', { defaultValue: 'Start time: {{time}}', time: startLabel })}
        >
          <Text className="text-base text-text-primary">{t('fastingProtocol.startTime', { defaultValue: 'Start time' })}</Text>
          <View className="flex-row items-center">
            <Text className="text-sm" style={{ color: accentPrimary }}>
              {startLabel}
            </Text>
            <Icon
              name={showStartPicker ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={accentPrimary}
              style={{ marginLeft: 4 }}
            />
          </View>
        </TouchableOpacity>

        {showStartPicker && (
          <DateTimePicker
            mode="single"
            date={startDate}
            timePicker
            onChange={handleStartChange}
            components={{
              IconPrev: <Icon name="chevron-back" size={18} color={textPrimary} />,
              IconNext: <Icon name="chevron-forward" size={18} color={textPrimary} />,
            }}
            styles={{
              selected: { backgroundColor: accentPrimary },
              selected_label: { color: '#FFFFFF' },
              today: { borderColor: accentPrimary, borderWidth: 1 },
              day_label: { color: textPrimary },
              weekday_label: { color: textSecondary },
              month_selector_label: { color: textPrimary, fontWeight: '600' },
              year_selector_label: { color: textPrimary, fontWeight: '600' },
              time_selector_label: { color: textPrimary, fontWeight: '600' },
              disabled_label: { color: textMuted },
              month_label: { color: textPrimary },
              year_label: { color: textPrimary },
              time_label: { color: textPrimary },
              selected_month: { backgroundColor: accentPrimary },
              selected_month_label: { color: '#FFFFFF' },
              selected_year: { backgroundColor: accentPrimary },
              selected_year_label: { color: '#FFFFFF' },
            }}
          />
        )}

        <Button
          variant="primary"
          onPress={handleStart}
          disabled={isPending || !customValid}
          className="mt-4"
        >
          {isPending ? t('fastingProtocol.starting', { defaultValue: 'Starting...' }) : t('fastingProtocol.startAction', { defaultValue: 'Start Fasting' })}
        </Button>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

FastingProtocolSheet.displayName = 'FastingProtocolSheet';

export default FastingProtocolSheet;
