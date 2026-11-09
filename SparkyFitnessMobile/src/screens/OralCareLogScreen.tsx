import { useRef, useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  localDateTimeToUtc,
  ORAL_CARE_DEFAULT_SETTINGS,
  ORAL_CARE_TYPES,
  todayInZone,
  utcToLocalDateTimeInput,
  type OralCareType,
} from '@workspace/shared';
import type { RootStackParamList } from '../types/navigation';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useOralCareDay,
  useOralCareHistory,
  useOralCareMutations,
} from '../hooks/useOralCare';
import { usePreferences } from '../hooks/usePreferences';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import TimeSheet, { type TimeSheetRef } from '../components/TimeSheet';
import { BrushingTimerModal } from '../components/oralCare/BrushingTimerModal';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import { getDeviceTimezone } from '../utils/dateUtils';
import { formatLocalizedTimeOfDay } from '../utils/medicationScheduleLocalization';
import { formatOralCareClock, oralCareTypeLabel } from '../utils/oralCare';
import Icon from '../components/Icon';

type Props = NativeStackScreenProps<RootStackParamList, 'OralCareLog'>;

const MAX_DURATION_SECONDS = 3600;
/** sky-500, readable on the tinted card in light and dark themes. */
const TIMER_TINT = '#0ea5e9';

function nowTimeOfDay(timezone: string): string {
  return utcToLocalDateTimeInput(new Date().toISOString(), timezone).slice(
    11,
    16
  );
}

/**
 * Logs an oral care session for `date`, or edits `session` when one is passed.
 * `startTimer` opens the brushing timer straight away (the Add menu's and the
 * card's Start timer).
 */
export default function OralCareLogScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const timezone = getDeviceTimezone();

  const session = route.params?.session ?? null;
  const [date] = useState(
    () =>
      session?.entry_date ??
      route.params?.date ??
      useDiaryDateStore.getState().selectedDate
  );
  const { data: day } = useOralCareDay(date);
  const { data: history } = useOralCareHistory(date, !session);
  const { createSession, updateSession } = useOralCareMutations();
  const targetSeconds =
    day?.settings.target_seconds ?? ORAL_CARE_DEFAULT_SETTINGS.target_seconds;

  const [careType, setCareType] = useState<OralCareType>(
    session?.care_type ?? route.params?.careType ?? 'brushing'
  );
  const [customLabel, setCustomLabel] = useState(session?.custom_label ?? '');
  const [timeOfDay, setTimeOfDay] = useState(() => {
    if (session?.start_time) {
      return utcToLocalDateTimeInput(session.start_time, timezone).slice(
        11,
        16
      );
    }
    return date === todayInZone(timezone) ? nowTimeOfDay(timezone) : '12:00';
  });
  const initialDuration = session?.duration_seconds ?? 0;
  const [minutes, setMinutes] = useState(
    initialDuration ? String(Math.floor(initialDuration / 60)) : ''
  );
  const [seconds, setSeconds] = useState(
    initialDuration ? String(initialDuration % 60) : ''
  );
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timerVisible, setTimerVisible] = useState(
    Boolean(route.params?.startTimer) && !session
  );
  const timeSheetRef = useRef<TimeSheetRef>(null);

  const durationSeconds =
    (parseInt(minutes, 10) || 0) * 60 + (parseInt(seconds, 10) || 0);
  const labelMissing = careType === 'other' && customLabel.trim() === '';
  const durationTooLong = durationSeconds > MAX_DURATION_SECONDS;
  const notesTooLong = notes.length > 2000;
  const canSave =
    !labelMissing && !durationTooLong && !notesTooLong && !isSubmitting;

  const closeIfStillOpen = () => {
    if (navigation.isFocused()) navigation.goBack();
  };
  const showSaveError = () => {
    Toast.show({
      type: 'error',
      text1: t('oralCare.errors.save', {
        defaultValue: 'Could not save the session.',
      }),
    });
  };

  const handleSubmit = async () => {
    if (!canSave) return;
    const start = localDateTimeToUtc(`${date}T${timeOfDay}`, timezone);
    const duration = durationSeconds > 0 ? durationSeconds : null;
    const body = {
      entry_date: date,
      start_time: start.toISOString(),
      end_time: duration
        ? new Date(start.getTime() + duration * 1000).toISOString()
        : null,
      duration_seconds: duration,
      care_type: careType,
      custom_label: careType === 'other' ? customLabel.trim() : null,
      notes: notes.trim() || null,
    };
    setIsSubmitting(true);
    try {
      if (session) await updateSession(session.id, body);
      else await createSession({ ...body, provider: 'manual' });
      closeIfStillOpen();
    } catch {
      showSaveError();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTimerSave = async (startedAt: Date, duration: number) => {
    const durationSeconds = Math.min(duration, MAX_DURATION_SECONDS);
    try {
      await createSession({
        entry_date: date,
        start_time: startedAt.toISOString(),
        end_time: new Date(
          startedAt.getTime() + durationSeconds * 1000
        ).toISOString(),
        duration_seconds: durationSeconds,
        care_type: 'brushing',
        provider: 'timer',
      });
    } catch (error) {
      showSaveError();
      throw error;
    }
    closeIfStillOpen();
  };

  const title = session
    ? t('oralCare.log.editTitle', { defaultValue: 'Edit session' })
    : t('oralCare.log.addTitle', { defaultValue: 'Log oral care' });

  const header = useScreenHeader({
    title,
    nativeTitle: title,
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      disabled: isSubmitting,
      accessibilityLabel: t('common.cancel', { defaultValue: 'Cancel' }),
    },
    right: [
      {
        kind: 'primary',
        label: t('common.save', { defaultValue: 'Save' }),
        onPress: handleSubmit,
        busy: isSubmitting,
        disabled: !canSave,
        placement: 'native-only',
        identifier: 'oral-care-log-save',
      },
    ],
  });

  const recentLabels = history?.recent_custom_labels ?? [];

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 pt-4"
        contentContainerStyle={{
          paddingBottom: usesNativeHeader ? insets.bottom + 24 : 24,
        }}
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
      >
        {!session && careType === 'brushing' && (
          <TouchableOpacity
            onPress={() => setTimerVisible(true)}
            className="mb-4 p-3 rounded-2xl bg-sky-500/10 border border-sky-500/25 flex-row items-center gap-3"
            accessibilityRole="button"
            accessibilityLabel={t('oralCare.log.startTimerA11y', {
              defaultValue: 'Start the {{time}} brushing timer',
              time: formatOralCareClock(targetSeconds),
            })}
            testID="oral-care-start-timer"
          >
            <View className="w-11 h-11 rounded-full bg-sky-500/15 items-center justify-center">
              <Icon name="timer" size={22} color={TIMER_TINT} />
            </View>
            <View className="flex-1">
              <Text className="text-sky-600 dark:text-sky-400 font-bold text-base">
                {t('oralCare.log.timerTitle', {
                  defaultValue: 'Brush with the timer',
                })}
              </Text>
              <Text className="text-text-secondary text-xs mt-0.5">
                {t('oralCare.log.timerHint', {
                  defaultValue:
                    '{{time}}, a quarter of your mouth at a time. Saves the brush for you.',
                  time: formatOralCareClock(targetSeconds),
                })}
              </Text>
            </View>
            <View className="w-11 h-11 rounded-full bg-sky-500 items-center justify-center">
              <Icon name="play" size={18} color="#ffffff" />
            </View>
          </TouchableOpacity>
        )}

        <Text className="text-text-secondary text-xs font-semibold mb-2 uppercase">
          {t('oralCare.log.type', { defaultValue: 'Type' })}
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {ORAL_CARE_TYPES.map((type) => {
            const selected = careType === type;
            return (
              <TouchableOpacity
                key={type}
                onPress={() => setCareType(type)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`px-3 py-1.5 rounded-xl border ${
                  selected
                    ? 'bg-accent-primary/20 border-accent-primary'
                    : 'bg-surface-elevated border-border-subtle'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    selected
                      ? 'text-accent-primary font-bold'
                      : 'text-text-secondary'
                  }`}
                >
                  {oralCareTypeLabel(type, t)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {careType === 'other' && (
          <View className="mb-4">
            <Text className="text-text-secondary text-xs font-semibold mb-1 uppercase">
              {t('oralCare.log.name', { defaultValue: 'Name' })}
            </Text>
            <FormInput
              value={customLabel}
              onChangeText={setCustomLabel}
              maxLength={50}
              placeholder={t('oralCare.log.namePlaceholder', {
                defaultValue: 'e.g. Water flosser',
              })}
              accessibilityLabel={t('oralCare.log.name', {
                defaultValue: 'Name',
              })}
            />
            {recentLabels.length > 0 && (
              <View className="flex-row flex-wrap gap-2 mt-2">
                {recentLabels.map((label) => (
                  <TouchableOpacity
                    key={label}
                    onPress={() => setCustomLabel(label)}
                    accessibilityRole="button"
                    className="px-3 py-1 rounded-xl border bg-surface-elevated border-border-subtle"
                  >
                    <Text className="text-xs text-text-secondary">{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        <SettingsRowGroup>
          <SettingsRow
            title={t('oralCare.log.time', { defaultValue: 'Time' })}
            onPress={() => timeSheetRef.current?.present()}
            rightAccessory={
              <Text className="text-base text-text-secondary">
                {formatLocalizedTimeOfDay(
                  timeOfDay,
                  undefined,
                  preferences?.time_format
                )}
              </Text>
            }
          />
        </SettingsRowGroup>

        <Text className="text-text-secondary text-xs font-semibold mt-4 mb-1 uppercase">
          {t('oralCare.log.duration', { defaultValue: 'Duration (optional)' })}
        </Text>
        <View className="flex-row gap-3 mb-1">
          <View className="flex-1">
            <FormInput
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              placeholder={t('oralCare.log.minutesShort', {
                defaultValue: 'min',
              })}
              accessibilityLabel={t('oralCare.log.minutes', {
                defaultValue: 'Minutes',
              })}
            />
          </View>
          <View className="flex-1">
            <FormInput
              value={seconds}
              onChangeText={setSeconds}
              keyboardType="number-pad"
              placeholder={t('oralCare.log.secondsShort', {
                defaultValue: 'sec',
              })}
              accessibilityLabel={t('oralCare.log.seconds', {
                defaultValue: 'Seconds',
              })}
            />
          </View>
        </View>
        {durationTooLong && (
          <Text className="text-xs text-danger mb-2">
            {t('oralCare.log.tooLong', {
              defaultValue: 'A session can be at most 60 minutes.',
            })}
          </Text>
        )}

        <Text className="text-text-secondary text-xs font-semibold mt-3 mb-1 uppercase">
          {t('oralCare.log.notes', { defaultValue: 'Notes (optional)' })}
        </Text>
        <FormInput
          value={notes}
          onChangeText={setNotes}
          maxLength={2000}
          multiline
          numberOfLines={3}
          accessibilityLabel={t('oralCare.log.notesA11y', {
            defaultValue: 'Notes',
          })}
        />
      </KeyboardAwareScrollView>

      {!usesNativeHeader && (
        <FooterSaveBar
          onPress={handleSubmit}
          busy={isSubmitting}
          disabled={!canSave}
        />
      )}

      <TimeSheet
        ref={timeSheetRef}
        value={timeOfDay}
        onSelectTime={setTimeOfDay}
      />

      <BrushingTimerModal
        visible={timerVisible}
        targetSeconds={targetSeconds}
        onClose={() => setTimerVisible(false)}
        onSave={handleTimerSave}
      />
    </View>
  );
}
