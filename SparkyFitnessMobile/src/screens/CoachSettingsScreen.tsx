import { formatDateTime } from '../utils/fasting';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COACH_DIET_TYPES,
  COACH_TONES,
  MAX_COACH_CHECKIN_TIMES,
  MAX_COACH_MESSAGES_PER_DAY,
  type CoachView,
} from '@workspace/shared';
import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import SegmentedControl from '../components/SegmentedControl';
import StepperInput, { useStepperDraft } from '../components/StepperInput';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import ServerGate from '../components/ServerGate';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useReminderTimeRows } from '../components/ReminderTimeRows';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import {
  useCheckInNow,
  useCoachesAvailable,
  useCoachSettings,
  useUpdateBuiltinCoach,
  useUpdateCoachProfile,
} from '../hooks/useCoaches';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { coachDescription, coachName } from '../utils/coachLabels';
import { dayFromNow, normalizeCheckinTimes } from '../utils/coachTimes';
import type { RootStackScreenProps } from '../types/navigation';

const NOT_SET = 'none';
const PAUSE_DAYS = ['3', '7', '14'] as const;

/**
 * Settings → Coaches (#2013): which coaches are on, when they check in, how
 * many messages a day, a pause, and About me. Coaches of your own are made on
 * the website for now; they are listed here and can be switched on or off.
 */
export default function CoachSettingsScreen({
  navigation,
}: RootStackScreenProps<'CoachSettings'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { preferences } = usePreferences();
  const available = useCoachesAvailable();
  const { data, isLoading, refetch } = useCoachSettings();
  const updateProfile = useUpdateCoachProfile();
  const updateBuiltin = useUpdateBuiltinCoach();
  const checkIn = useCheckInNow();
  const coachNotifications = useAppPreferencesStore(
    (s) => s.coachNotificationsEnabled
  );
  const setCoachNotifications = useAppPreferencesStore(
    (s) => s.setCoachNotificationsEnabled
  );
  const muted = useAppPreferencesStore((s) => s.mutedCoachNotificationIds);
  const setMuted = useAppPreferencesStore((s) => s.setCoachNotificationMuted);
  const profile = data?.profile;

  // Typed text is held here until saved; `undefined` shows what is saved.
  const [avoidDraft, setAvoid] = useState<string>();
  const [preferDraft, setPrefer] = useState<string>();
  const [notesDraft, setNotes] = useState<string>();
  const avoid = avoidDraft ?? profile?.foods_avoid ?? '';
  const prefer = preferDraft ?? profile?.foods_prefer ?? '';
  const notes = notesDraft ?? profile?.notes ?? '';
  const [pauseDays, setPauseDays] = useState<(typeof PAUSE_DAYS)[number]>('7');

  const header = useScreenHeader({
    title: t('coaches.settings.title', { defaultValue: 'Coaches' }),
    left: { kind: 'back' },
  });

  const timeRows = useReminderTimeRows({
    times: profile?.checkin_times ?? [],
    onChangeTimes: (times) =>
      updateProfile.mutate({ checkin_times: normalizeCheckinTimes(times) }),
    maxTimes: MAX_COACH_CHECKIN_TIMES,
    timeFormat: preferences?.time_format,
    labels: {
      reminder: (number) =>
        t('coaches.schedule.checkIn', {
          defaultValue: 'Check-in {{number}}',
          number,
        }),
      reminderA11y: (number, time) =>
        t('coaches.schedule.checkInAccessibility', {
          defaultValue: 'Check-in {{number}}, {{time}}',
          number,
          time,
        }),
      remove: (number) =>
        t('coaches.schedule.removeCheckIn', {
          defaultValue: 'Remove check-in {{number}}',
          number,
        }),
      add: t('coaches.schedule.addTime', { defaultValue: 'Add a time' }),
    },
  });

  const saveAboutMe = useCallback(() => {
    updateProfile.mutate(
      {
        foods_avoid: avoid.trim() || null,
        foods_prefer: prefer.trim() || null,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          setAvoid(undefined);
          setPrefer(undefined);
          setNotes(undefined);
        },
      }
    );
  }, [avoid, prefer, notes, updateProfile]);

  const maxMessagesStepper = useStepperDraft({
    value: profile?.max_messages_per_day ?? 3,
    min: 1,
    max: MAX_COACH_MESSAGES_PER_DAY,
    onCommit: (val) => updateProfile.mutate({ max_messages_per_day: val }),
  });

  const dietOptions = [
    {
      value: NOT_SET,
      label: t('coaches.aboutMe.notSet', { defaultValue: 'Not set' }),
    },
    ...COACH_DIET_TYPES.map((value) => ({
      value: value as string,
      // i18n-audit-ignore-next-line dynamic-i18n-key -- one label per shared diet type
      label: t(`coaches.diets.${value}`, { defaultValue: value }),
    })),
  ];
  const toneOptions = [
    {
      value: NOT_SET,
      label: t('coaches.aboutMe.notSet', { defaultValue: 'Not set' }),
    },
    ...COACH_TONES.map((value) => ({
      value: value as string,
      // i18n-audit-ignore-next-line dynamic-i18n-key -- one label per shared tone
      label: t(`coaches.tones.${value}`, { defaultValue: value }),
    })),
  ];

  const checkInResultText = (
    sent: number,
    reason: 'paused' | 'no_coaches' | 'limit_reached' | 'nothing_to_say' | null
  ): string => {
    if (sent > 0) {
      return t('coaches.checkInNow.sent', {
        defaultValue: '{{count}} new messages. Open the chat to read them.',
        defaultValue_one: '{{count}} new message. Open the chat to read it.',
        count: sent,
      });
    }
    switch (reason) {
      case 'paused':
        return t('coaches.checkInNow.reasonPaused', {
          defaultValue: 'Coaches are paused.',
        });
      case 'no_coaches':
        return t('coaches.checkInNow.reasonNoCoaches', {
          defaultValue:
            'No coach is switched on. Switch one on in the list below.',
        });
      case 'limit_reached':
        return t('coaches.checkInNow.reasonLimit', {
          defaultValue: "Today's message limit is already reached.",
        });
      default:
        return t('coaches.checkInNow.reasonNothing', {
          defaultValue:
            "Nothing to say right now: no rule matches today's data, or the coaches already said it today.",
        });
    }
  };

  const switchCoach = (coach: CoachView, enabled: boolean) => {
    if (coach.builtin_key) {
      updateBuiltin.mutate({ key: coach.builtin_key, body: { enabled } });
    }
  };

  return (
    <View className="flex-1 bg-background">
      {header}
      <ServerGate>
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
          }}
          contentInsetAdjustmentBehavior={
            usesNativeHeader ? 'automatic' : 'never'
          }
        >
          {!available ? (
            <View className="gap-3">
              <Text className="text-text-secondary text-base">
                {t('coaches.settings.off', {
                  defaultValue:
                    'Coaches are off. Turn them on in Settings → Features to get short, timely messages from coaches that look at your food, training and sleep.',
                })}
              </Text>
              <Button
                variant="secondary"
                onPress={() => navigation.navigate('FeatureSettings')}
              >
                {t('coaches.settings.openFeatures', {
                  defaultValue: 'Open Features',
                })}
              </Button>
            </View>
          ) : isLoading && !data ? (
            <StatusView inline loading />
          ) : !data || !profile ? (
            <View className="gap-4">
              <Text className="text-text-secondary">
                {t('coaches.settings.loadError', {
                  defaultValue: 'Could not load your coaches.',
                })}
              </Text>
              <Button
                variant="secondary"
                onPress={() => {
                  void refetch();
                }}
              >
                {t('common.retry', { defaultValue: 'Retry' })}
              </Button>
            </View>
          ) : (
            <>
              <SettingsRowGroup
                title={t('coaches.checkInNow.title', {
                  defaultValue: 'Check in now',
                })}
                subtitle={
                  data.last_checkin_at
                    ? t('coaches.checkInNow.last', {
                        defaultValue: 'Last check-in: {{when}}.',
                        when: formatDateTime(new Date(data.last_checkin_at)),
                      })
                    : t('coaches.checkInNow.never', {
                        defaultValue:
                          'No check-in has run yet. They run at your check-in times.',
                      })
                }
              >
                <View className="gap-3 p-3">
                  <Button
                    variant="secondary"
                    disabled={checkIn.isPending}
                    onPress={() => checkIn.mutate()}
                  >
                    {t('coaches.checkInNow.button', {
                      defaultValue: 'Check in now',
                    })}
                  </Button>
                  <Button
                    variant="secondary"
                    onPress={() => navigation.navigate('Chat')}
                  >
                    {t('coaches.checkInNow.openChat', {
                      defaultValue: 'Open chat',
                    })}
                  </Button>
                  {checkIn.data && (
                    <Text className="text-text-secondary text-sm">
                      {checkInResultText(
                        checkIn.data.sent,
                        checkIn.data.reason
                      )}
                    </Text>
                  )}
                </View>
              </SettingsRowGroup>

              <SettingsRowGroup
                title={t('coaches.list.title', {
                  defaultValue: 'Your coaches',
                })}
                subtitle={t('coaches.list.cost', {
                  defaultValue:
                    'Coaches use your AI provider only when a rule matches. Without one, you get a short fixed message instead.',
                })}
              >
                {data.coaches.map((coach) => {
                  const name = coachName(t, coach.builtin_key, coach.name);
                  return (
                    <SettingsRow
                      key={coach.id ?? coach.builtin_key}
                      title={name}
                      subtitle={
                        coach.builtin_key
                          ? coachDescription(t, coach.builtin_key)
                          : t('coaches.list.customRules', {
                              defaultValue: '{{count}} rules',
                              defaultValue_one: '{{count}} rule',
                              count: coach.rules.rules.length,
                            })
                      }
                      subtitleNumberOfLines={0}
                      rightAccessory={
                        <Switch
                          accessibilityLabel={name}
                          value={coach.enabled}
                          disabled={!coach.builtin_key}
                          onValueChange={(on) => switchCoach(coach, on)}
                        />
                      }
                    />
                  );
                })}
              </SettingsRowGroup>

              <SettingsRowGroup
                title={t('coaches.schedule.title', {
                  defaultValue: 'When coaches check in',
                })}
              >
                {timeRows.rows}
              </SettingsRowGroup>
              {timeRows.sheet}

              <SettingsRowGroup
                title={t('coaches.schedule.maxMessages', {
                  defaultValue: 'At most this many messages a day',
                })}
              >
                <View className="flex-row items-center justify-between px-4 py-3">
                  <Text className="text-text-primary text-base">
                    {t('coaches.schedule.maxMessagesLabel', {
                      defaultValue: 'Daily limit',
                    })}
                  </Text>
                  <StepperInput
                    {...maxMessagesStepper}
                    keyboardType="number-pad"
                  />
                </View>
              </SettingsRowGroup>

              <SettingsRowGroup
                title={t('coaches.pause.title', {
                  defaultValue: 'Pause coaches',
                })}
                subtitle={t('coaches.pause.description', {
                  defaultValue:
                    'Sick, travelling or injured? Coaches stay quiet until the date you choose.',
                })}
              >
                {profile.paused_until ? (
                  <SettingsRow
                    title={t('coaches.pause.until', {
                      defaultValue: 'Paused until {{date}}.',
                      date: profile.paused_until,
                    })}
                    onPress={() =>
                      updateProfile.mutate({
                        paused_until: null,
                        pause_reason: null,
                      })
                    }
                    rightAccessory={
                      <Text className="text-accent-primary text-sm font-semibold">
                        {t('coaches.pause.resume', {
                          defaultValue: 'Resume now',
                        })}
                      </Text>
                    }
                  />
                ) : (
                  <View className="gap-3 p-3">
                    <SegmentedControl
                      segments={PAUSE_DAYS.map((days) => ({
                        key: days,
                        label: t('coaches.pause.days', {
                          defaultValue: '{{count}} days',
                          defaultValue_one: '{{count}} day',
                          count: Number(days),
                        }),
                      }))}
                      activeKey={pauseDays}
                      onSelect={setPauseDays}
                    />
                    <Button
                      variant="secondary"
                      onPress={() =>
                        updateProfile.mutate({
                          paused_until: dayFromNow(Number(pauseDays)),
                          pause_reason: 'other',
                        })
                      }
                    >
                      {t('coaches.pause.pause', { defaultValue: 'Pause' })}
                    </Button>
                  </View>
                )}
              </SettingsRowGroup>

              <SettingsRowGroup
                title={t('coaches.aboutMe.title', { defaultValue: 'About me' })}
                subtitle={t('coaches.aboutMe.description', {
                  defaultValue:
                    'Your coaches and Sparky chat use this. You can change or clear it any time.',
                })}
              >
                <SettingsRow
                  title={t('coaches.aboutMe.diet', { defaultValue: 'Diet' })}
                  rightAccessory={
                    <BottomSheetPicker
                      value={profile.diet_type ?? NOT_SET}
                      options={dietOptions}
                      title={t('coaches.aboutMe.diet', {
                        defaultValue: 'Diet',
                      })}
                      containerStyle={{ minWidth: 150 }}
                      onSelect={(value) =>
                        updateProfile.mutate({
                          diet_type:
                            value === NOT_SET
                              ? null
                              : (value as (typeof COACH_DIET_TYPES)[number]),
                        })
                      }
                    />
                  }
                />
                <SettingsRow
                  title={t('coaches.aboutMe.tone', { defaultValue: 'Tone' })}
                  rightAccessory={
                    <BottomSheetPicker
                      value={profile.tone ?? NOT_SET}
                      options={toneOptions}
                      title={t('coaches.aboutMe.tone', {
                        defaultValue: 'Tone',
                      })}
                      containerStyle={{ minWidth: 150 }}
                      onSelect={(value) =>
                        updateProfile.mutate({
                          tone:
                            value === NOT_SET
                              ? null
                              : (value as (typeof COACH_TONES)[number]),
                        })
                      }
                    />
                  }
                />
                <View className="gap-2 p-3">
                  <Text className="text-text-secondary text-sm">
                    {t('coaches.aboutMe.foodsAvoid', {
                      defaultValue: 'Foods to avoid',
                    })}
                  </Text>
                  <FormInput
                    value={avoid}
                    maxLength={500}
                    onChangeText={setAvoid}
                  />
                  <Text className="text-text-secondary text-sm">
                    {t('coaches.aboutMe.foodsPrefer', {
                      defaultValue: 'Foods I like',
                    })}
                  </Text>
                  <FormInput
                    value={prefer}
                    maxLength={500}
                    onChangeText={setPrefer}
                  />
                  <Text className="text-text-secondary text-sm">
                    {t('coaches.aboutMe.notes', {
                      defaultValue: 'Anything else coaches should know',
                    })}
                  </Text>
                  <FormInput
                    value={notes}
                    maxLength={1000}
                    multiline
                    onChangeText={setNotes}
                  />
                  {data.allergens.length > 0 && (
                    <Text className="text-text-secondary text-sm">
                      {t('coaches.knowledge.allergies', {
                        defaultValue: 'Allergies: {{list}}',
                        list: data.allergens.join(', '),
                      })}
                    </Text>
                  )}
                  <Button variant="secondary" onPress={saveAboutMe}>
                    {t('common.save', { defaultValue: 'Save' })}
                  </Button>
                </View>
              </SettingsRowGroup>

              <SettingsRowGroup
                title={t('coaches.notifications.title', {
                  defaultValue: 'Phone notifications',
                })}
                subtitle={t('coaches.notifications.description', {
                  defaultValue:
                    'A notification shows when a coach writes. On iPhone it can come a little after the check-in time.',
                })}
              >
                <SettingsRow
                  title={t('coaches.notifications.all', {
                    defaultValue: 'Notify me about coach messages',
                  })}
                  rightAccessory={
                    <Switch
                      accessibilityLabel={t('coaches.notifications.all', {
                        defaultValue: 'Notify me about coach messages',
                      })}
                      value={coachNotifications}
                      onValueChange={setCoachNotifications}
                    />
                  }
                />
                {coachNotifications &&
                  data.coaches
                    .filter((coach) => coach.id && coach.enabled)
                    .map((coach) => {
                      const name = coachName(t, coach.builtin_key, coach.name);
                      const id = coach.id ?? '';
                      return (
                        <SettingsRow
                          key={id}
                          title={name}
                          rightAccessory={
                            <Switch
                              accessibilityLabel={t(
                                'coaches.notifications.coach',
                                {
                                  defaultValue: 'Notify me about {{name}}',
                                  name,
                                }
                              )}
                              value={!muted.includes(id)}
                              onValueChange={(on) => setMuted(id, !on)}
                            />
                          }
                        />
                      );
                    })}
              </SettingsRowGroup>
            </>
          )}
        </ScrollView>
      </ServerGate>
    </View>
  );
}
