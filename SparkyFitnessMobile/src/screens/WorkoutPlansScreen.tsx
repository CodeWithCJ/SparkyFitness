import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import FooterActionBar from '../components/FooterActionBar';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import {
  useDeleteWorkoutPlan,
  useServerConnection,
  useWorkoutPlans,
} from '../hooks';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import type {
  WorkoutPlanAssignment,
  WorkoutPlanTemplate,
} from '../types/workoutPlans';
import { formatDateLabel } from '../utils/dateUtils';

type WorkoutPlansScreenProps = RootStackScreenProps<'WorkoutPlans'>;

function assignmentName(assignment: WorkoutPlanAssignment): string {
  return assignment.workout_preset_name || assignment.exercise_name || '';
}

const WorkoutPlansScreen: React.FC<WorkoutPlansScreenProps> = ({
  navigation,
}) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const [refreshing, setRefreshing] = useState(false);
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { workoutPlans, isLoading, isError, refetch } = useWorkoutPlans({
    enabled: isConnected,
  });
  const { deleteWorkoutPlanAsync, isPending: isDeleting } =
    useDeleteWorkoutPlan();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const weekdays = useMemo(
    () => [
      t('mealPlans.weekdaysShort.sunday', { defaultValue: 'Sun' }),
      t('mealPlans.weekdaysShort.monday', { defaultValue: 'Mon' }),
      t('mealPlans.weekdaysShort.tuesday', { defaultValue: 'Tue' }),
      t('mealPlans.weekdaysShort.wednesday', { defaultValue: 'Wed' }),
      t('mealPlans.weekdaysShort.thursday', { defaultValue: 'Thu' }),
      t('mealPlans.weekdaysShort.friday', { defaultValue: 'Fri' }),
      t('mealPlans.weekdaysShort.saturday', { defaultValue: 'Sat' }),
    ],
    [t]
  );

  const assignmentLabel = useCallback(
    (plan: WorkoutPlanTemplate, assignment: WorkoutPlanAssignment): string => {
      const where =
        plan.schedule_type === 'sequential'
          ? assignment.session_name ||
            t('workoutPlans.sessionNumber', {
              defaultValue: 'Session {{number}}',
              number: assignment.session_index ?? 1,
            })
          : (weekdays[assignment.day_of_week ?? 0] ?? '');
      return [where, assignmentName(assignment)].filter(Boolean).join(' · ');
    },
    [t, weekdays]
  );

  const showError = useCallback(
    (title: string) => {
      Toast.show({
        type: 'error',
        text1: title,
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    },
    [t]
  );

  const confirmDelete = useCallback(
    (plan: WorkoutPlanTemplate) => {
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
              } catch {
                showError(
                  t('workoutPlans.deleteFailed', {
                    defaultValue: 'Failed to delete workout plan',
                  })
                );
              }
            },
          },
        ]
      );
    },
    [deleteWorkoutPlanAsync, showError, t]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const header = useScreenHeader({
    title: t('workoutPlans.title', { defaultValue: 'Workout plans' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add',
      accessibilityLabel: t('workoutPlans.create', {
        defaultValue: 'Create workout plan',
      }),
      onPress: () => navigation.navigate('WorkoutPlanForm'),
    },
  });

  const renderPlan = ({ item }: { item: WorkoutPlanTemplate }) => {
    const assignments = item.assignments ?? [];
    return (
      <View className="bg-surface rounded-xl px-4 py-4 mb-3 shadow-sm">
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate('WorkoutPlanForm', { template: item })
          }
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-lg font-semibold text-text-primary">
                {item.plan_name}
              </Text>
              {item.description ? (
                <Text className="text-sm text-text-secondary mt-1">
                  {item.description}
                </Text>
              ) : null}
            </View>
            <View
              className={
                item.is_active
                  ? 'bg-success-soft px-2.5 py-1 rounded-full'
                  : 'bg-raised px-2.5 py-1 rounded-full'
              }
            >
              <Text
                className={
                  item.is_active
                    ? 'text-success text-xs font-semibold'
                    : 'text-text-secondary text-xs font-semibold'
                }
              >
                {item.is_active
                  ? t('workoutPlans.active', { defaultValue: 'Active' })
                  : t('workoutPlans.inactive', { defaultValue: 'Inactive' })}
              </Text>
            </View>
          </View>
          <Text className="text-sm text-text-secondary mt-3">
            {[
              item.schedule_type === 'sequential'
                ? t('workoutPlans.sequential', { defaultValue: 'Sequential' })
                : t('workoutPlans.weekly', { defaultValue: 'Weekly' }),
              item.end_date
                ? t('workoutPlans.dateRange', {
                    defaultValue: '{{start}} – {{end}}',
                    start: formatDateLabel(
                      item.start_date.slice(0, 10),
                      t,
                      dateLocale
                    ),
                    end: formatDateLabel(
                      item.end_date.slice(0, 10),
                      t,
                      dateLocale
                    ),
                  })
                : t('workoutPlans.starting', {
                    defaultValue: 'Starting {{date}}',
                    date: formatDateLabel(
                      item.start_date.slice(0, 10),
                      t,
                      dateLocale
                    ),
                  }),
            ].join(' · ')}
          </Text>
          <View className="mt-3">
            {assignments.slice(0, 3).map((assignment) => (
              <Text
                key={assignment.id}
                className="text-sm text-text-primary mb-1"
              >
                {assignmentLabel(item, assignment)}
              </Text>
            ))}
            {assignments.length > 3 ? (
              <Text className="text-sm text-text-secondary">
                {t('workoutPlans.moreAssignments', {
                  defaultValue: '+{{count}} more',
                  count: assignments.length - 3,
                })}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View className="flex-row justify-end mt-2 border-t border-border-subtle pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workoutPlans.deleteNamed', {
              defaultValue: 'Delete {{name}}',
              name: item.plan_name,
            })}
            disabled={isDeleting}
            className="p-3"
            onPress={() => confirmDelete(item)}
          >
            <Icon name="trash" size={20} color="#dc2626" />
          </Pressable>
        </View>
      </View>
    );
  };

  const content = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          title={t('workoutPlans.noServer', {
            defaultValue: 'No server configured',
          })}
          subtitle={t('workoutPlans.noServerSubtitle', {
            defaultValue:
              'Configure your server connection to manage workout plans.',
          })}
          action={{
            label: t('workoutPlans.goToSettings', {
              defaultValue: 'Go to Settings',
            }),
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }
    if (isLoading || isConnectionLoading) {
      return (
        <StatusView
          loading
          title={t('workoutPlans.loading', {
            defaultValue: 'Loading workout plans...',
          })}
        />
      );
    }
    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('workoutPlans.loadFailed', {
            defaultValue: 'Failed to load workout plans',
          })}
          subtitle={t('workoutPlans.loadFailedSubtitle', {
            defaultValue: 'Check your connection and try again.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
            variant: 'primary',
          }}
        />
      );
    }
    return (
      <FlatList
        data={workoutPlans}
        keyExtractor={(item) => item.id}
        renderItem={renderPlan}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 16,
          flexGrow: 1,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accentColor}
          />
        }
        ListEmptyComponent={
          <StatusView
            inline
            icon="exercise-weights"
            title={t('workoutPlans.emptyTitle', {
              defaultValue: 'No workout plans yet',
            })}
            subtitle={t('workoutPlans.emptySubtitle', {
              defaultValue:
                'Schedule your saved workouts on set days, or as a cycle you work through.',
            })}
            action={{
              label: t('workoutPlans.create', {
                defaultValue: 'Create workout plan',
              }),
              onPress: () => navigation.navigate('WorkoutPlanForm'),
              variant: 'primary',
            }}
          />
        }
      />
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {content()}
      {workoutPlans.length > 0 && !isLoading && !isError ? (
        <FooterActionBar>
          <Button onPress={() => navigation.navigate('WorkoutPlanForm')}>
            {t('workoutPlans.create', { defaultValue: 'Create workout plan' })}
          </Button>
        </FooterActionBar>
      ) : null}
    </View>
  );
};

export default WorkoutPlansScreen;
