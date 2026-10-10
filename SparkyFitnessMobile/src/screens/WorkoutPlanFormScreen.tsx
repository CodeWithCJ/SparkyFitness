import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import SegmentedControl from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import {
  useCreateWorkoutPlan,
  useUpdateWorkoutPlan,
  useWorkoutPresets,
} from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import type {
  WorkoutPlanDraft,
  WorkoutPlanDraftAssignment,
  WorkoutPlanScheduleType,
  WorkoutPlanValidationErrors,
} from '../types/workoutPlans';
import { formatDateLabel, toLocalDateString } from '../utils/dateUtils';
import {
  buildWorkoutPlanPayload,
  changeScheduleType,
  createPresetAssignment,
  createWorkoutPlanDraft,
  removeSession,
  validateWorkoutPlanDraft,
} from '../utils/workoutPlanForm';

type WorkoutPlanFormScreenProps = RootStackScreenProps<'WorkoutPlanForm'>;

type DateField = 'startDate' | 'endDate';

const WorkoutPlanFormScreen: React.FC<WorkoutPlanFormScreenProps> = ({
  navigation,
  route,
}) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [dangerColor, accentColor] = useCSSVariable([
    '--color-icon-danger',
    '--color-accent-primary',
  ]) as [string, string];
  const template = route.params?.template;
  const today = useMemo(() => toLocalDateString(new Date()), []);
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const {
    presets,
    isLoading: isPresetsLoading,
    isError: isPresetsError,
    refetch: refetchPresets,
  } = useWorkoutPresets();
  const [draft, setDraft] = useState<WorkoutPlanDraft>(() =>
    createWorkoutPlanDraft(today, template)
  );
  const [selectedDay, setSelectedDay] = useState(() =>
    template?.schedule_type === 'sequential'
      ? new Date().getDay()
      : (template?.assignments?.[0]?.day_of_week ?? new Date().getDay())
  );
  const [errors, setErrors] = useState<WorkoutPlanValidationErrors>({});
  const { createWorkoutPlanAsync, isPending: isCreating } =
    useCreateWorkoutPlan();
  const { updateWorkoutPlanAsync, isPending: isUpdating } =
    useUpdateWorkoutPlan(template?.id);
  const isSaving = isCreating || isUpdating;
  const calendarRef = useRef<CalendarSheetRef>(null);
  const [dateField, setDateField] = useState<DateField>('startDate');

  const dayNames = useMemo(
    () => [
      t('mealPlans.weekdays.sunday', { defaultValue: 'Sunday' }),
      t('mealPlans.weekdays.monday', { defaultValue: 'Monday' }),
      t('mealPlans.weekdays.tuesday', { defaultValue: 'Tuesday' }),
      t('mealPlans.weekdays.wednesday', { defaultValue: 'Wednesday' }),
      t('mealPlans.weekdays.thursday', { defaultValue: 'Thursday' }),
      t('mealPlans.weekdays.friday', { defaultValue: 'Friday' }),
      t('mealPlans.weekdays.saturday', { defaultValue: 'Saturday' }),
    ],
    [t]
  );

  const presetOptions = useMemo(
    () =>
      presets.map((preset) => ({
        label: preset.name,
        value: String(preset.id),
      })),
    [presets]
  );

  const updateDraft = useCallback(
    <K extends keyof WorkoutPlanDraft>(key: K, value: WorkoutPlanDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setErrors((current) => ({
        ...current,
        ...(key === 'planName' ? { planName: undefined } : null),
        ...(key === 'startDate' || key === 'endDate'
          ? { startDate: undefined, endDate: undefined }
          : null),
      }));
    },
    []
  );

  const addPreset = useCallback(
    (
      presetId: string,
      slot: { dayOfWeek: number | null; sessionIndex: number | null }
    ) => {
      const preset = presets.find(
        (candidate) => String(candidate.id) === presetId
      );
      if (!preset) return;
      setDraft((current) => ({
        ...current,
        assignments: [
          ...current.assignments,
          createPresetAssignment(preset, slot),
        ],
      }));
      setErrors((current) => ({ ...current, assignments: undefined }));
    },
    [presets]
  );

  const removeAssignment = useCallback((key: string) => {
    setDraft((current) => ({
      ...current,
      assignments: current.assignments.filter(
        (assignment) => assignment.key !== key
      ),
    }));
  }, []);

  const selectScheduleType = useCallback(
    (next: WorkoutPlanScheduleType) => {
      if (next === draft.scheduleType) return;
      const apply = () => {
        setDraft((current) => changeScheduleType(current, next));
        setErrors({});
      };
      if (draft.assignments.length === 0) {
        apply();
        return;
      }
      Alert.alert(
        t('workoutPlans.changeScheduleTitle', {
          defaultValue: 'Change schedule type?',
        }),
        t('workoutPlans.changeScheduleMessage', {
          defaultValue:
            'Weekly and sequential plans are laid out differently, so the workouts you added will be cleared.',
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
          },
          {
            text: t('workoutPlans.changeScheduleConfirm', {
              defaultValue: 'Change',
            }),
            style: 'destructive',
            onPress: apply,
          },
        ]
      );
    },
    [draft.assignments.length, draft.scheduleType, t]
  );

  const openDatePicker = useCallback((field: DateField) => {
    setDateField(field);
    calendarRef.current?.present();
  }, []);

  const save = useCallback(async () => {
    const nextErrors = validateWorkoutPlanDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      const currentClientDate = toLocalDateString(new Date());
      const payload = buildWorkoutPlanPayload(draft);
      if (template) await updateWorkoutPlanAsync(payload, currentClientDate);
      else await createWorkoutPlanAsync(payload, currentClientDate);
      Toast.show({
        type: 'success',
        text1: template
          ? t('workoutPlans.updateSuccess', {
              defaultValue: 'Workout plan updated',
            })
          : t('workoutPlans.createSuccess', {
              defaultValue: 'Workout plan created',
            }),
      });
      navigation.goBack();
    } catch {
      Toast.show({
        type: 'error',
        text1: template
          ? t('workoutPlans.updateFailed', {
              defaultValue: 'Failed to update workout plan',
            })
          : t('workoutPlans.createFailed', {
              defaultValue: 'Failed to create workout plan',
            }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    }
  }, [
    createWorkoutPlanAsync,
    draft,
    navigation,
    t,
    template,
    updateWorkoutPlanAsync,
  ]);

  const header = useScreenHeader({
    title: template
      ? t('workoutPlans.editTitle', { defaultValue: 'Edit workout plan' })
      : t('workoutPlans.createTitle', { defaultValue: 'Create workout plan' }),
    left: { kind: 'back', disabled: isSaving },
    right: {
      kind: 'primary',
      placement: 'native-only',
      busy: isSaving,
      disabled: isSaving || isPresetsLoading || isPresetsError,
      onPress: () => void save(),
    },
  });

  const containerStyle = !usesNativeHeader
    ? { paddingTop: insets.top }
    : undefined;

  if (isPresetsLoading) {
    return (
      <View className="flex-1 bg-background" style={containerStyle}>
        {header}
        <StatusView
          loading
          title={t('workoutPlans.loadingWorkouts', {
            defaultValue: 'Loading your workouts...',
          })}
        />
      </View>
    );
  }

  if (isPresetsError) {
    return (
      <View className="flex-1 bg-background" style={containerStyle}>
        {header}
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('workoutPlans.workoutsLoadFailed', {
            defaultValue: 'Failed to load your workouts',
          })}
          subtitle={t('workoutPlans.loadFailedSubtitle', {
            defaultValue: 'Check your connection and try again.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetchPresets(),
            variant: 'primary',
          }}
        />
      </View>
    );
  }

  const renderAssignment = (assignment: WorkoutPlanDraftAssignment) => {
    const name =
      assignment.workout_preset_name ||
      assignment.exercise_name ||
      t('workoutPlans.unnamedWorkout', { defaultValue: 'Workout' });
    return (
      <View
        key={assignment.key}
        className="flex-row items-center justify-between border-t border-border-subtle pt-3 mt-3"
      >
        <View className="flex-1 mr-3">
          <Text className="text-base font-semibold text-text-primary">
            {name}
          </Text>
          {assignment.exercise_id ? (
            <Text className="text-xs text-text-secondary mt-0.5">
              {t('workoutPlans.singleExercise', {
                defaultValue: 'Single exercise',
              })}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('workoutPlans.removeNamed', {
            defaultValue: 'Remove {{name}}',
            name,
          })}
          hitSlop={8}
          onPress={() => removeAssignment(assignment.key)}
        >
          <Icon name="trash" size={19} color={dangerColor} />
        </Pressable>
      </View>
    );
  };

  const renderAddWorkout = (slot: {
    dayOfWeek: number | null;
    sessionIndex: number | null;
  }) => (
    <BottomSheetPicker<string>
      value=""
      options={presetOptions}
      onSelect={(presetId) => addPreset(presetId, slot)}
      title={t('workoutPlans.chooseWorkout', {
        defaultValue: 'Choose a workout',
      })}
      renderTrigger={({ onPress }) => (
        <Button
          variant="secondary"
          accessibilityLabel={t('workoutPlans.addWorkout', {
            defaultValue: 'Add workout',
          })}
          onPress={onPress}
          disabled={presetOptions.length === 0}
          className="mt-4"
        >
          {t('workoutPlans.addWorkout', { defaultValue: 'Add workout' })}
        </Button>
      )}
    />
  );

  const dateRow = (field: DateField, label: string, optional: boolean) => {
    const value = draft[field];
    return (
      <View className="mt-4">
        <Text className="text-sm font-medium text-text-secondary mb-2">
          {label}
        </Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => openDatePicker(field)}
            className="flex-1 min-h-11 px-3 py-2.5 rounded-lg border border-border-subtle bg-raised justify-center"
          >
            <Text className="text-base text-text-primary">
              {value
                ? formatDateLabel(value, t, dateLocale)
                : t('workoutPlans.noEndDate', { defaultValue: 'No end date' })}
            </Text>
          </Pressable>
          {optional && value ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workoutPlans.clearEndDate', {
                defaultValue: 'Clear end date',
              })}
              hitSlop={8}
              onPress={() => updateDraft(field, '')}
            >
              <Icon name="close" size={20} color={accentColor} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  const weeklyAssignments = draft.assignments.filter(
    (assignment) => assignment.day_of_week === selectedDay
  );
  const sessionNumbers = Array.from(
    { length: draft.sessionCount },
    (_, index) => index + 1
  );

  return (
    <View className="flex-1 bg-background" style={containerStyle}>
      {header}
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text className="text-sm font-medium text-text-secondary mb-2">
          {t('workoutPlans.name', { defaultValue: 'Plan name' })}
        </Text>
        <FormInput
          value={draft.planName}
          placeholder={t('workoutPlans.namePlaceholder', {
            defaultValue: 'Workout plan name',
          })}
          onChangeText={(value) => updateDraft('planName', value)}
        />
        {errors.planName ? (
          <Text className="text-sm text-icon-danger mt-1">
            {t('workoutPlans.nameRequired', {
              defaultValue: 'Plan name is required.',
            })}
          </Text>
        ) : null}

        <Text className="text-sm font-medium text-text-secondary mt-4 mb-2">
          {t('workoutPlans.description', { defaultValue: 'Description' })}
        </Text>
        <FormInput
          value={draft.description}
          placeholder={t('workoutPlans.descriptionPlaceholder', {
            defaultValue: 'Optional notes about this plan',
          })}
          multiline
          onChangeText={(value) => updateDraft('description', value)}
          style={{ minHeight: 84, textAlignVertical: 'top' }}
        />

        {dateRow(
          'startDate',
          t('workoutPlans.startDate', { defaultValue: 'Start date' }),
          false
        )}
        {dateRow(
          'endDate',
          t('workoutPlans.endDate', { defaultValue: 'End date (optional)' }),
          true
        )}
        {errors.endDate ? (
          <Text className="text-sm text-icon-danger mt-1">
            {t('workoutPlans.endBeforeStart', {
              defaultValue: 'The end date cannot be before the start date.',
            })}
          </Text>
        ) : null}

        <View className="bg-surface rounded-xl px-4 py-4 mt-4 flex-row items-center justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold text-text-primary">
              {t('workoutPlans.activePlan', { defaultValue: 'Active plan' })}
            </Text>
            <Text className="text-sm text-text-secondary mt-1">
              {t('workoutPlans.activePlanHint', {
                defaultValue:
                  'An active plan puts its workouts on your days and in the watch’s schedule.',
              })}
            </Text>
          </View>
          <Switch
            accessibilityLabel={t('workoutPlans.activePlan', {
              defaultValue: 'Active plan',
            })}
            value={draft.isActive}
            onValueChange={(value) => updateDraft('isActive', value)}
          />
        </View>

        <Text className="text-sm font-medium text-text-secondary mt-4 mb-2">
          {t('workoutPlans.scheduleType', { defaultValue: 'Schedule' })}
        </Text>
        <SegmentedControl<WorkoutPlanScheduleType>
          segments={[
            {
              key: 'weekly',
              label: t('workoutPlans.weekly', { defaultValue: 'Weekly' }),
            },
            {
              key: 'sequential',
              label: t('workoutPlans.sequential', {
                defaultValue: 'Sequential',
              }),
            },
          ]}
          activeKey={draft.scheduleType}
          onSelect={selectScheduleType}
        />
        <Text className="text-sm text-text-secondary mt-2">
          {draft.scheduleType === 'weekly'
            ? t('workoutPlans.weeklyHint', {
                defaultValue: 'Workouts repeat on the same days each week.',
              })
            : t('workoutPlans.sequentialHint', {
                defaultValue:
                  'Workouts form a cycle. You do the next session whenever you train.',
              })}
        </Text>

        {draft.scheduleType === 'weekly' ? (
          <View className="bg-surface rounded-xl px-4 py-4 mt-4 flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-base font-semibold text-text-primary">
                {t('workoutPlans.prefillDiary', {
                  defaultValue: 'Fill in my diary',
                })}
              </Text>
              <Text className="text-sm text-text-secondary mt-1">
                {t('workoutPlans.prefillDiaryHint', {
                  defaultValue:
                    'Add each day’s workouts to the diary ahead of time. Off, you are asked when you start one.',
                })}
              </Text>
            </View>
            <Switch
              accessibilityLabel={t('workoutPlans.prefillDiary', {
                defaultValue: 'Fill in my diary',
              })}
              value={draft.entryMode === 'prefill'}
              onValueChange={(value) =>
                updateDraft('entryMode', value ? 'prefill' : 'prompt')
              }
            />
          </View>
        ) : null}

        {draft.scheduleType === 'weekly' ? (
          <>
            <Text className="text-lg font-semibold text-text-primary mt-6 mb-3">
              {t('workoutPlans.weeklyPlan', { defaultValue: 'Weekly plan' })}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {dayNames.map((label, day) => {
                const isSelected = day === selectedDay;
                const hasAssignments = draft.assignments.some(
                  (assignment) => assignment.day_of_week === day
                );
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelectedDay(day)}
                    className={
                      isSelected
                        ? 'min-w-24 rounded-xl bg-accent-primary px-3 py-2.5 items-center'
                        : 'min-w-24 rounded-xl bg-raised px-3 py-2.5 items-center'
                    }
                  >
                    <Text
                      className={
                        isSelected
                          ? 'text-sm font-semibold text-white'
                          : 'text-sm font-semibold text-text-primary'
                      }
                    >
                      {label}
                    </Text>
                    <View
                      className={
                        hasAssignments
                          ? isSelected
                            ? 'w-1.5 h-1.5 rounded-full bg-white mt-1'
                            : 'w-1.5 h-1.5 rounded-full bg-accent-primary mt-1'
                          : 'w-1.5 h-1.5 mt-1'
                      }
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
            <View className="bg-surface rounded-xl px-4 py-4 mt-4 border border-border-subtle">
              <Text className="text-lg font-semibold text-text-primary">
                {dayNames[selectedDay]}
              </Text>
              {weeklyAssignments.length === 0 ? (
                <Text className="text-sm text-text-secondary mt-1">
                  {t('workoutPlans.restDay', {
                    defaultValue: 'Nothing scheduled. A rest day.',
                  })}
                </Text>
              ) : null}
              {weeklyAssignments.map(renderAssignment)}
              {renderAddWorkout({ dayOfWeek: selectedDay, sessionIndex: null })}
            </View>
          </>
        ) : (
          <>
            <Text className="text-lg font-semibold text-text-primary mt-6 mb-3">
              {t('workoutPlans.sessions', { defaultValue: 'Sessions' })}
            </Text>
            {sessionNumbers.map((sessionIndex) => (
              <View
                key={sessionIndex}
                className="bg-surface rounded-xl px-4 py-4 mb-4 border border-border-subtle"
              >
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-lg font-semibold text-text-primary">
                    {t('workoutPlans.sessionNumber', {
                      defaultValue: 'Session {{number}}',
                      number: sessionIndex,
                    })}
                  </Text>
                  {draft.sessionCount > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(
                        'workoutPlans.removeSessionNumber',
                        {
                          defaultValue: 'Remove session {{number}}',
                          number: sessionIndex,
                        }
                      )}
                      hitSlop={8}
                      onPress={() =>
                        setDraft((current) =>
                          removeSession(current, sessionIndex)
                        )
                      }
                    >
                      <Icon name="trash" size={19} color={dangerColor} />
                    </Pressable>
                  ) : null}
                </View>
                <FormInput
                  value={draft.sessionNames[sessionIndex] ?? ''}
                  placeholder={t('workoutPlans.sessionNamePlaceholder', {
                    defaultValue: 'Session name (optional)',
                  })}
                  onChangeText={(value) =>
                    updateDraft('sessionNames', {
                      ...draft.sessionNames,
                      [sessionIndex]: value,
                    })
                  }
                />
                {draft.assignments
                  .filter(
                    (assignment) => assignment.session_index === sessionIndex
                  )
                  .map(renderAssignment)}
                {renderAddWorkout({ dayOfWeek: null, sessionIndex })}
              </View>
            ))}
            <Button
              variant="secondary"
              onPress={() =>
                updateDraft('sessionCount', draft.sessionCount + 1)
              }
            >
              {t('workoutPlans.addSession', { defaultValue: 'Add session' })}
            </Button>
          </>
        )}

        {errors.assignments ? (
          <Text className="text-sm text-icon-danger mt-3">
            {t('workoutPlans.assignmentRequired', {
              defaultValue: 'Add at least one workout to the plan.',
            })}
          </Text>
        ) : null}
        <View className="bg-raised rounded-xl px-4 py-3 mt-4">
          <Text className="text-sm text-text-secondary">
            {t('workoutPlans.presetNotice', {
              defaultValue:
                'You can add the workouts saved in your library. To plan a single exercise, use the web app.',
            })}
          </Text>
        </View>
      </KeyboardAwareScrollView>

      {!usesNativeHeader ? (
        <FooterSaveBar
          onPress={() => void save()}
          busy={isSaving}
          disabled={isSaving}
        />
      ) : null}

      <CalendarSheet
        ref={calendarRef}
        selectedDate={draft[dateField] || today}
        onSelectDate={(date) => {
          updateDraft(dateField, date);
          calendarRef.current?.dismiss();
        }}
      />
    </View>
  );
};

export default WorkoutPlanFormScreen;
