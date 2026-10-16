import { useState } from 'react';
import { Platform, View, Text, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  CreateMindfulnessSessionBody,
  UpdateMindfulnessSessionBody,
} from '@workspace/shared';
import type { RootStackParamList } from '../types/navigation';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useMindfulnessMutations } from '../hooks/useMindfulness';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import { BreathworkModal } from '../components/mindfulness/BreathworkModal';
import { MeditationTimerModal } from '../components/mindfulness/MeditationTimerModal';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import {
  MINDFULNESS_SESSION_TYPES,
  mindfulnessSessionTypeEmoji,
  mindfulnessSessionTypeLabel,
  offeredMindfulnessSessionType,
} from '../utils/mindfulnessSessionTypes';

type Props = NativeStackScreenProps<RootStackParamList, 'MindfulnessLog'>;

const optionalNumber = (value: number | null | undefined): string =>
  value != null ? String(value) : '';

/**
 * Logs a mindful session for `date`, or edits `session` when one is passed.
 * Presented like Measurements: a fixed header, a scrolling form and a sticky
 * Save, so the navigator owns Android's hardware Back.
 */
export default function MindfulnessLogScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();

  const session = route.params?.session ?? null;
  // Like Measurements: without a date, log on the day Dashboard / Diary show.
  const [date] = useState(
    () => route.params?.date ?? useDiaryDateStore.getState().selectedDate
  );
  const { saveSession, updateSession } = useMindfulnessMutations(date);

  const initialSeconds = session?.duration_seconds ?? 15 * 60;
  const [durationMinutes, setDurationMinutes] = useState(
    String(Math.floor(initialSeconds / 60))
  );
  const [durationSeconds, setDurationSeconds] = useState(
    String(initialSeconds % 60)
  );
  // Saved as is unless another type is picked, so editing a session whose
  // type the app does not offer keeps that type; its chip reads as Other.
  const [sessionType, setSessionType] = useState(
    session ? session.session_type : 'meditation'
  );
  const selectedType = offeredMindfulnessSessionType(sessionType);
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [heartRateAvg, setHeartRateAvg] = useState(
    optionalNumber(session?.heart_rate_avg)
  );
  const [heartRateStart, setHeartRateStart] = useState(
    optionalNumber(session?.heart_rate_start)
  );
  const [heartRateEnd, setHeartRateEnd] = useState(
    optionalNumber(session?.heart_rate_end)
  );
  const [hrvRmssd, setHrvRmssd] = useState(optionalNumber(session?.hrv_rmssd));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [breathworkVisible, setBreathworkVisible] = useState(false);
  const [timerVisible, setTimerVisible] = useState(false);

  // A save can finish after the user already left (Cancel, Back or a swipe
  // while it was pending). Going back then would close the screen this one
  // was opened from, such as MindfulnessDetail.
  const closeIfStillOpen = () => {
    if (navigation.isFocused()) navigation.goBack();
  };

  const showSaveError = () => {
    Toast.show({
      type: 'error',
      text1: t('common.error', { defaultValue: 'Error' }),
    });
  };

  // Paced Breathing and the Meditation Timer log their own session, which
  // finishes this one too.
  const handlePracticeSave = async (
    durationSecs: number,
    sType: string,
    closePractice: () => void
  ) => {
    try {
      await saveSession({
        entry_date: date,
        duration_seconds: durationSecs,
        session_type: sType,
        provider: 'manual',
      });
    } catch (error) {
      showSaveError();
      // Rejecting is how the practice learns the save failed: it then stays
      // open with the session instead of resetting it, so Finish can retry.
      throw error;
    }
    closePractice();
    closeIfStillOpen();
  };

  const handleSubmit = async () => {
    const mins = parseInt(durationMinutes, 10) || 0;
    const secs = parseInt(durationSeconds, 10) || 0;
    const totalSeconds = mins * 60 + secs;
    if (totalSeconds <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (session) {
        const payload: UpdateMindfulnessSessionBody = {
          duration_seconds: totalSeconds,
          session_type: sessionType,
          notes: notes.trim() || null,
          heart_rate_avg: heartRateAvg ? parseFloat(heartRateAvg) : null,
          heart_rate_start: heartRateStart
            ? parseInt(heartRateStart, 10)
            : null,
          heart_rate_end: heartRateEnd ? parseInt(heartRateEnd, 10) : null,
          hrv_rmssd: hrvRmssd ? parseFloat(hrvRmssd) : null,
        };
        await updateSession(session.id, payload);
      } else {
        const payload: CreateMindfulnessSessionBody = {
          entry_date: date,
          duration_seconds: totalSeconds,
          session_type: sessionType,
          provider: 'manual',
          notes: notes.trim() || null,
          heart_rate_avg: heartRateAvg ? parseFloat(heartRateAvg) : null,
          heart_rate_start: heartRateStart
            ? parseInt(heartRateStart, 10)
            : null,
          heart_rate_end: heartRateEnd ? parseInt(heartRateEnd, 10) : null,
          hrv_rmssd: hrvRmssd ? parseFloat(hrvRmssd) : null,
        };
        await saveSession(payload);
      }
      closeIfStillOpen();
    } catch {
      showSaveError();
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = session
    ? t('mindfulness.modal.editTitle', {
        defaultValue: 'Edit Mindful Session',
      })
    : t('mindfulness.modal.addTitle', {
        defaultValue: 'Log Mindful Session',
      });

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
        disabled: isSubmitting,
        placement: 'native-only',
        identifier: 'mindfulness-log-save',
      },
    ],
  });

  return (
    <View
      className="flex-1 bg-background"
      // Like MeasurementsAdd: iOS presents this as a sheet that already starts
      // below the status bar, so only Android needs the top inset.
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      {header}

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 pt-4"
        // Without the sticky footer (native iOS header), the end of the form
        // has to clear the home indicator itself.
        contentContainerStyle={{
          paddingBottom: usesNativeHeader ? insets.bottom + 24 : 24,
        }}
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
      >
        {!session && (
          <View className="mb-4 pb-4 border-b border-border-subtle">
            <Text className="text-text-secondary text-xs font-semibold mb-2 uppercase">
              {t('mindfulness.tools.title', {
                defaultValue: 'Interactive Practice',
              })}
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setBreathworkVisible(true)}
                className="flex-1 p-3 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex-row items-center gap-2.5"
                accessibilityRole="button"
              >
                <Text className="text-2xl">🌊</Text>
                <View className="flex-1">
                  <Text className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                    {t('mindfulness.tools.breatheTitle', {
                      defaultValue: 'Paced Breathing',
                    })}
                  </Text>
                  <Text
                    className="text-text-secondary text-[10px]"
                    numberOfLines={1}
                  >
                    {t('mindfulness.tools.breatheSubtitle', {
                      defaultValue: 'Box, 4-7-8, Coherence protocols',
                    })}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setTimerVisible(true)}
                className="flex-1 p-3 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex-row items-center gap-2.5"
                accessibilityRole="button"
              >
                <Text className="text-2xl">⏱️</Text>
                <View className="flex-1">
                  <Text className="text-purple-600 dark:text-purple-400 font-bold text-sm">
                    {t('mindfulness.tools.timerTitle', {
                      defaultValue: 'Meditation Timer',
                    })}
                  </Text>
                  <Text
                    className="text-text-secondary text-[10px]"
                    numberOfLines={1}
                  >
                    {t('mindfulness.tools.timerSubtitle', {
                      defaultValue: 'Timed countdown & open stopwatch',
                    })}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Session Type */}
        <Text className="text-text-secondary text-xs font-semibold mb-2 uppercase">
          {t('mindfulness.modal.type', { defaultValue: 'Session Type' })}
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {MINDFULNESS_SESSION_TYPES.map((typeKey) => {
            const isSelected = selectedType === typeKey;
            return (
              <TouchableOpacity
                key={typeKey}
                onPress={() => {
                  // Other already shown for an unoffered type keeps that type.
                  if (typeKey !== selectedType) setSessionType(typeKey);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className={`px-3 py-1.5 rounded-xl border ${
                  isSelected
                    ? 'bg-accent-primary/20 border-accent-primary'
                    : 'bg-surface-elevated border-border-subtle'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    isSelected
                      ? 'text-accent-primary font-bold'
                      : 'text-text-secondary'
                  }`}
                >
                  {mindfulnessSessionTypeEmoji(typeKey)}{' '}
                  {mindfulnessSessionTypeLabel(typeKey, t)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Duration */}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className="text-text-secondary text-xs font-semibold mb-1 uppercase">
              {t('mindfulness.modal.minutes', {
                defaultValue: 'Minutes',
              })}
            </Text>
            <FormInput
              value={durationMinutes}
              onChangeText={setDurationMinutes}
              keyboardType="numeric"
              placeholder="15"
              accessibilityLabel={t(
                'mindfulness.modal.durationMinutesAccessibility',
                {
                  defaultValue: 'Duration in minutes',
                }
              )}
            />
          </View>
          <View className="flex-1">
            <Text className="text-text-secondary text-xs font-semibold mb-1 uppercase">
              {t('mindfulness.modal.seconds', {
                defaultValue: 'Seconds',
              })}
            </Text>
            <FormInput
              value={durationSeconds}
              onChangeText={setDurationSeconds}
              keyboardType="numeric"
              placeholder="0"
              accessibilityLabel={t(
                'mindfulness.modal.durationSecondsAccessibility',
                {
                  defaultValue: 'Duration in seconds',
                }
              )}
            />
          </View>
        </View>

        {/* Vitals & Heart Rate (Optional) */}
        <Text className="text-text-secondary text-xs font-semibold mt-4 mb-2 uppercase">
          {t('mindfulness.modal.vitalsHeader', {
            defaultValue: 'Heart Rate & HRV (Optional)',
          })}
        </Text>
        <View className="flex-row gap-3 mb-2">
          <View className="flex-1">
            <Text className="text-text-muted text-xs mb-1">
              {t('mindfulness.modal.avgHr', {
                defaultValue: 'Avg HR (bpm)',
              })}
            </Text>
            <FormInput
              value={heartRateAvg}
              onChangeText={setHeartRateAvg}
              keyboardType="numeric"
              placeholder="65"
              accessibilityLabel={t('mindfulness.modal.avgHrAccessibility', {
                defaultValue: 'Average heart rate',
              })}
            />
          </View>
          <View className="flex-1">
            <Text className="text-text-muted text-xs mb-1">
              {t('mindfulness.modal.hrv', { defaultValue: 'HRV (ms)' })}
            </Text>
            <FormInput
              value={hrvRmssd}
              onChangeText={setHrvRmssd}
              keyboardType="numeric"
              placeholder="50"
              accessibilityLabel={t('mindfulness.modal.hrvAccessibility', {
                defaultValue: 'HRV RMSSD',
              })}
            />
          </View>
        </View>

        <View className="flex-row gap-3 mb-4">
          <View className="flex-1">
            <Text className="text-text-muted text-xs mb-1">
              {t('mindfulness.modal.startHr', {
                defaultValue: 'Start HR',
              })}
            </Text>
            <FormInput
              value={heartRateStart}
              onChangeText={setHeartRateStart}
              keyboardType="numeric"
              placeholder="75"
              accessibilityLabel={t('mindfulness.modal.startHrAccessibility', {
                defaultValue: 'Start heart rate',
              })}
            />
          </View>
          <View className="flex-1">
            <Text className="text-text-muted text-xs mb-1">
              {t('mindfulness.modal.endHr', { defaultValue: 'End HR' })}
            </Text>
            <FormInput
              value={heartRateEnd}
              onChangeText={setHeartRateEnd}
              keyboardType="numeric"
              placeholder="60"
              accessibilityLabel={t('mindfulness.modal.endHrAccessibility', {
                defaultValue: 'End heart rate',
              })}
            />
          </View>
        </View>

        {/* Notes */}
        <Text className="text-text-secondary text-xs font-semibold mb-1 uppercase">
          {t('mindfulness.modal.notes', {
            defaultValue: 'Notes (Optional)',
          })}
        </Text>
        <FormInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t('mindfulness.modal.notesPlaceholder', {
            defaultValue: 'How was your practice?',
          })}
          accessibilityLabel={t('mindfulness.modal.notesAccessibility', {
            defaultValue: 'Notes',
          })}
          multiline
          numberOfLines={3}
        />
      </KeyboardAwareScrollView>

      {!usesNativeHeader && (
        <FooterSaveBar
          onPress={handleSubmit}
          busy={isSubmitting}
          disabled={isSubmitting}
        />
      )}

      <BreathworkModal
        visible={breathworkVisible}
        onClose={() => setBreathworkVisible(false)}
        onSave={(secs, type) =>
          handlePracticeSave(secs, type, () => setBreathworkVisible(false))
        }
      />

      <MeditationTimerModal
        visible={timerVisible}
        onClose={() => setTimerVisible(false)}
        onSave={(secs, type) =>
          handlePracticeSave(secs, type, () => setTimerVisible(false))
        }
      />
    </View>
  );
}
