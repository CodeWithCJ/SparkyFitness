import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Icon from '../components/Icon';
import ServerGate from '../components/ServerGate';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import {
  useDeleteWorkoutPlan,
  usePreferences,
  useUpdateWorkoutPlan,
  useWorkoutPlans,
} from '../hooks';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import type { WorkoutPlanAssignment } from '../types/workoutPlans';
import { formatDateLabel, toLocalDateString } from '../utils/dateUtils';
import { formatWeightDisplay } from '../utils/unitConversions';
import { workoutPlanTemplateToPayload } from '../utils/workoutPlanForm';

type WorkoutPlanDetailScreenProps = RootStackScreenProps<'WorkoutPlanDetail'>;

interface PlanSection {
  key: string;
  title: string;
  assignments: WorkoutPlanAssignment[];
}

const WorkoutPlanDetailScreen: React.FC<WorkoutPlanDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { runNavigationAction } = useNavigationActionGuard(navigation);
  const { preferences } = usePreferences();
  const { workoutPlans } = useWorkoutPlans();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const template = route.params.template;
  // The list query is the live source of truth; the route params go stale as
  // soon as the plan is edited or toggled somewhere else.
  const plan = useMemo(
    () =>
      workoutPlans.find((candidate) => candidate.id === template.id) ??
      template,
    [workoutPlans, template]
  );
  const { updateWorkoutPlanAsync, isPending: isToggling } =
    useUpdateWorkoutPlan(plan.id);
  const { deleteWorkoutPlanAsync, isPending: isDeleting } =
    useDeleteWorkoutPlan();
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  // Workout screens only know how to display kg or lbs. Coerce st_lbs to lbs
  // so we never quietly hand an unsupported unit to weightFromKg.
  const weightUnit: 'kg' | 'lbs' =
    preferences?.default_weight_unit === 'kg' ? 'kg' : 'lbs';

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

  const sections = useMemo<PlanSection[]>(() => {
    const assignments = plan.assignments ?? [];
    if (plan.schedule_type === 'sequential') {
      const indexes = Array.from(
        new Set(assignments.map((a) => a.session_index ?? 1))
      ).sort((a, b) => a - b);
      return indexes.map((index) => {
        const inSession = assignments.filter(
          (a) => (a.session_index ?? 1) === index
        );
        const title =
          inSession.find((a) => a.session_name)?.session_name ||
          t('workoutPlans.sessionNumber', {
            defaultValue: 'Session {{number}}',
            number: index,
          });
        return {
          key: 'session-' + index,
          title,
          assignments: inSession,
        };
      });
    }
    const days = Array.from(
      new Set(assignments.map((a) => a.day_of_week ?? 0))
    ).sort((a, b) => a - b);
    return days.map((day) => ({
      key: 'day-' + day,
      title: dayNames[day] ?? '',
      assignments: assignments.filter((a) => (a.day_of_week ?? 0) === day),
    }));
  }, [plan.assignments, plan.schedule_type, dayNames, t]);

  const setSummary = useCallback(
    (set: WorkoutPlanAssignment['sets'][number]) => {
      const parts: string[] = [];
      if (set.reps != null) {
        parts.push(
          t('workoutPlans.repsCount', {
            defaultValue: '{{count}} reps',
            count: set.reps,
          })
        );
      }
      if (set.weight != null) {
        parts.push(formatWeightDisplay(set.weight, weightUnit));
      }
      if (set.rest_time != null) {
        parts.push(
          t('workoutPlans.restCount', {
            defaultValue: '{{count}} s rest',
            count: set.rest_time,
          })
        );
      }
      return parts.join(' · ');
    },
    [t, weightUnit]
  );

  const toggleActive = useCallback(
    async (next: boolean) => {
      try {
        const updated = await updateWorkoutPlanAsync(
          { ...workoutPlanTemplateToPayload(plan), is_active: next },
          toLocalDateString(new Date())
        );
        if (updated?.regeneration_failed) {
          Toast.show({
            type: 'error',
            text1: t('workoutPlans.regenerationFailed', {
              defaultValue: 'Saved, but refreshing the diary failed',
            }),
            text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
          });
          return;
        }
        const counts = updated?.regenerated_entries;
        Toast.show({
          type: 'success',
          text1: next
            ? t('workoutPlans.activated', {
                defaultValue: 'Plan activated',
              })
            : t('workoutPlans.deactivated', {
                defaultValue: 'Plan deactivated',
              }),
          ...(counts && counts.created > 0
            ? {
                text2: t('workoutPlans.refreshedSessions', {
                  defaultValue: 'Refreshed {{count}} upcoming sessions',
                  count: counts.created,
                }),
              }
            : counts && counts.removed > 0
              ? {
                  text2: t('workoutPlans.removedSessions', {
                    defaultValue: 'Removed {{count}} upcoming sessions',
                    count: counts.removed,
                  }),
                }
              : null),
        });
      } catch {
        Toast.show({
          type: 'error',
          text1: t('workoutPlans.updateFailed', {
            defaultValue: 'Failed to update workout plan',
          }),
          text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
        });
      }
    },
    [plan, t, updateWorkoutPlanAsync]
  );

  const confirmDelete = useCallback(() => {
    Alert.alert(
      t('workoutPlans.deleteTitle', { defaultValue: 'Delete workout plan' }),
      t('workoutPlans.deleteMessage', {
        defaultValue:
          'Delete {{name}}? Upcoming workouts this plan added to your diary will be removed.',
        name: plan.plan_name,
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorkoutPlanAsync(plan.id);
              Toast.show({
                type: 'success',
                text1: t('workoutPlans.deleteSuccess', {
                  defaultValue: 'Workout plan deleted',
                }),
              });
              // The user can press Back while the delete request is still in
              // flight; only pop when this screen is still in front.
              if (navigation.isFocused()) {
                navigation.goBack();
              }
            } catch {
              Toast.show({
                type: 'error',
                text1: t('workoutPlans.deleteFailed', {
                  defaultValue: 'Failed to delete workout plan',
                }),
                text2: t('common.tryAgain', {
                  defaultValue: 'Please try again.',
                }),
              });
            }
          },
        },
      ]
    );
  }, [deleteWorkoutPlanAsync, navigation, plan.id, plan.plan_name, t]);

  const header = useScreenHeader({
    title: plan.plan_name,
    nativeTitle: plan.plan_name,
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'pencil',
      ionicon: 'create',
      accessibilityLabel: t('workoutPlans.editTitle', {
        defaultValue: 'Edit workout plan',
      }),
      onPress: () =>
        runNavigationAction(() =>
          navigation.navigate('WorkoutPlanForm', { template: plan })
        ),
    },
  });

  const renderAssignment = (assignment: WorkoutPlanAssignment) => {
    const name =
      assignment.workout_preset_name ||
      assignment.exercise_name ||
      t('workoutPlans.unnamedWorkout', { defaultValue: 'Workout' });
    const typeLabel = assignment.workout_preset_id
      ? t('workoutPlans.savedWorkout', { defaultValue: 'Saved workout' })
      : t('workoutPlans.singleExercise', { defaultValue: 'Single exercise' });
    const sets = assignment.exercise_id ? (assignment.sets ?? []) : [];
    return (
      <View
        key={assignment.id}
        className="border-t border-border-subtle pt-3 mt-3"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-base font-semibold text-text-primary">
              {name}
            </Text>
            <Text className="text-xs text-text-secondary mt-0.5">
              {typeLabel}
            </Text>
          </View>
        </View>
        {sets.length > 0 ? (
          <View className="mt-1.5">
            {sets.map((set) => (
              <Text key={set.id} className="text-xs text-text-secondary mb-0.5">
                {t('workoutPlans.setNumber', {
                  defaultValue: 'Set {{number}}',
                  number: set.set_number,
                })}{' '}
                · {setSummary(set)}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const renderSection = (section: PlanSection) => {
    const isCollapsed = collapsedSections[section.key] ?? false;
    return (
      <View
        key={section.key}
        className="bg-surface rounded-xl px-4 py-4 mt-3 border border-border-subtle"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={section.title}
          onPress={() =>
            setCollapsedSections((current) => ({
              ...current,
              [section.key]: !isCollapsed,
            }))
          }
          className="flex-row items-center justify-between"
        >
          <Text className="text-base font-semibold text-text-primary">
            {section.title}
          </Text>
          <Icon
            name={isCollapsed ? 'chevron-down' : 'chevron-up'}
            size={18}
            color="#6b7280"
          />
        </Pressable>
        {!isCollapsed ? (
          <View className="mt-1">
            {section.assignments.map(renderAssignment)}
          </View>
        ) : null}
      </View>
    );
  };

  const showImpactNote =
    plan.is_active &&
    plan.schedule_type !== 'sequential' &&
    plan.entry_mode === 'prefill';

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ServerGate>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding,
          }}
        >
          <View className="bg-surface rounded-xl px-4 py-4 border border-border-subtle">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-3">
                <Text className="text-lg font-semibold text-text-primary">
                  {plan.plan_name}
                </Text>
                {plan.description ? (
                  <Text className="text-sm text-text-secondary mt-1">
                    {plan.description}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text className="text-sm text-text-secondary mt-3">
              {[
                plan.schedule_type === 'sequential'
                  ? t('workoutPlans.sequential', { defaultValue: 'Sequential' })
                  : t('workoutPlans.weekly', { defaultValue: 'Weekly' }),
                plan.sequence_position
                  ? t('workoutPlans.sessionPosition', {
                      defaultValue: 'Session {{current}} of {{total}}',
                      current: plan.sequence_position.current,
                      total: plan.sequence_position.total,
                    })
                  : plan.end_date
                    ? t('workoutPlans.dateRange', {
                        defaultValue: '{{start}} – {{end}}',
                        start: formatDateLabel(
                          plan.start_date.slice(0, 10),
                          t,
                          dateLocale
                        ),
                        end: formatDateLabel(
                          plan.end_date.slice(0, 10),
                          t,
                          dateLocale
                        ),
                      })
                    : t('workoutPlans.starting', {
                        defaultValue: 'Starting {{date}}',
                        date: formatDateLabel(
                          plan.start_date.slice(0, 10),
                          t,
                          dateLocale
                        ),
                      }),
              ].join(' · ')}
            </Text>
            <View className="flex-row items-center justify-between mt-4 border-t border-border-subtle pt-3">
              <View className="flex-1 mr-4">
                <Text className="text-base font-semibold text-text-primary">
                  {t('workoutPlans.activePlan', {
                    defaultValue: 'Active plan',
                  })}
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
                value={plan.is_active}
                disabled={isToggling}
                onValueChange={(value) => void toggleActive(value)}
              />
            </View>
            {showImpactNote ? (
              <View className="bg-raised rounded-xl px-3 py-2.5 mt-3">
                <Text className="text-xs text-text-secondary">
                  {t('workoutPlans.impactNote', {
                    defaultValue:
                      'This active plan fills upcoming sessions into your diary. Edits refresh only planned sessions; workouts you logged, started or finished stay untouched.',
                  })}
                </Text>
              </View>
            ) : null}
          </View>

          <Text className="text-lg font-semibold text-text-primary mt-6 mb-1">
            {plan.schedule_type === 'sequential'
              ? t('workoutPlans.sessions', { defaultValue: 'Sessions' })
              : t('workoutPlans.weeklyPlan', { defaultValue: 'Weekly plan' })}
          </Text>
          {sections.length === 0 ? (
            <StatusView
              inline
              icon="exercise-weights"
              title={t('workoutPlans.noAssignmentsTitle', {
                defaultValue: 'No workouts in this plan yet',
              })}
              subtitle={t('workoutPlans.noAssignmentsSubtitle', {
                defaultValue: 'Edit the plan to add workouts.',
              })}
            />
          ) : (
            sections.map(renderSection)
          )}
          <Button
            variant="secondary"
            accessibilityLabel={t('workoutPlans.deleteNamed', {
              defaultValue: 'Delete {{name}}',
              name: plan.plan_name,
            })}
            onPress={confirmDelete}
            disabled={isDeleting}
            className="mt-4"
          >
            {t('workoutPlans.deletePlan', { defaultValue: 'Delete plan' })}
          </Button>
        </ScrollView>
      </ServerGate>
    </View>
  );
};

export default WorkoutPlanDetailScreen;
