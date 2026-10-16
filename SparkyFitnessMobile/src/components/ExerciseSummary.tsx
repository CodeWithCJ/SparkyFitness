import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import SwipeableExerciseRow from './SwipeableExerciseRow';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { useActiveWorkoutPlans } from '../hooks/useActiveWorkoutPlan';
import type {
  WorkoutPlanAssignment,
  WorkoutPlanTemplate,
} from '../types/workoutPlans';
import BottomSheetPicker from './BottomSheetPicker';
import {
  getLoggedAssignmentIds,
  getUncompletedActivePlans,
} from '../utils/workoutPlanSchedule';

interface ExerciseSummaryProps {
  exerciseEntries: ExerciseSessionResponse[];
  entryDate: string;
  onPressWorkout?: (session: ExerciseSessionResponse) => void;
  onAddExercise?: () => void;
  /** A card shown with the workout-plan banners, e.g. today's training program. */
  programBanner?: React.ReactNode;
  onPressPlanAssignment?: (
    plan: WorkoutPlanTemplate,
    assignment: WorkoutPlanAssignment
  ) => void;
  getImageSource?: GetImageSource;
  weightUnit?: 'kg' | 'lbs';
  distanceUnit?: 'km' | 'miles';
}

const ExerciseSummary: React.FC<ExerciseSummaryProps> = ({
  exerciseEntries,
  entryDate,
  onPressWorkout,
  onAddExercise,
  onPressPlanAssignment,
  programBanner,
  getImageSource,
  weightUnit = 'kg',
  distanceUnit = 'km',
}) => {
  const { t } = useTranslation();
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const activeAccent = accentPrimary || '#3B82F6';
  const activeMuted = textMuted || '#6B7280';
  const { plans: activePlans } = useActiveWorkoutPlans(entryDate);
  const [selectedSessionMap, setSelectedSessionMap] = useState<
    Record<string, string>
  >({});

  const uncompletedActivePlans = useMemo(
    () =>
      getUncompletedActivePlans(
        activePlans || [],
        getLoggedAssignmentIds(exerciseEntries)
      ),
    [activePlans, exerciseEntries]
  );

  const getDistinctSessionsForPlan = (
    plan: WorkoutPlanTemplate
  ): WorkoutPlanAssignment[] => {
    if (!plan.assignments || plan.assignments.length === 0) return [];
    if (plan.schedule_type === 'sequential') {
      const seen = new Set<number>();
      const result: WorkoutPlanAssignment[] = [];
      for (const a of plan.assignments) {
        const idx = a.session_index ?? 1;
        if (!seen.has(idx)) {
          seen.add(idx);
          result.push(a);
        }
      }
      return result;
    } else {
      const todayAssignments =
        plan.next_assignments && plan.next_assignments.length > 0
          ? plan.next_assignments
          : plan.next_assignment
            ? [plan.next_assignment]
            : [];
      return todayAssignments;
    }
  };

  const planBannersOnly =
    uncompletedActivePlans.length > 0 ? (
      <View className="mb-2">
        {uncompletedActivePlans.map((plan) => {
          const distinctSessions = getDistinctSessionsForPlan(plan);
          const currentAssignmentId =
            selectedSessionMap[plan.id] ||
            (plan.next_assignment?.id ? String(plan.next_assignment.id) : '');
          const currentAssignment =
            distinctSessions.find(
              (a) => String(a.id) === currentAssignmentId
            ) ||
            plan.next_assignment ||
            distinctSessions[0];

          if (!currentAssignment) return null;

          const sessionTitle =
            currentAssignment.session_name ||
            (currentAssignment.session_index != null
              ? t('exerciseSummary.sessionNumberIndex', 'Session {{current}}', {
                  current: currentAssignment.session_index,
                })
              : null) ||
            currentAssignment.workout_preset_name ||
            currentAssignment.exercise_name ||
            t('exerciseSummary.title', 'Exercise');

          const sessionOptions = distinctSessions.map((session) => ({
            label:
              session.session_name ||
              (session.session_index != null
                ? t(
                    'exerciseSummary.sessionNumberIndex',
                    'Session {{current}}',
                    {
                      current: session.session_index,
                    }
                  )
                : session.workout_preset_name || session.exercise_name || ''),
            value: String(session.id),
          }));

          return (
            <View
              key={plan.id}
              className="bg-surface rounded-xl p-4 mb-2 shadow-sm"
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-1.5 flex-1">
                  <Icon
                    name={
                      plan.schedule_type === 'sequential'
                        ? 'repeat'
                        : 'calendar'
                    }
                    size={14}
                    color={activeAccent}
                  />
                  <Text
                    className="text-xs font-semibold text-text-secondary"
                    numberOfLines={1}
                  >
                    {plan.plan_name} •{' '}
                    {plan.schedule_type === 'sequential'
                      ? plan.sequence_position?.session_name ||
                        plan.next_assignment?.session_name ||
                        t(
                          'exerciseSummary.sessionNumber',
                          'Session {{current}} of {{total}}',
                          {
                            current: plan.sequence_position?.current ?? 1,
                            total:
                              plan.sequence_position?.total ??
                              plan.assignments?.length ??
                              1,
                          }
                        )
                      : t('exerciseSummary.scheduledToday', 'Scheduled Today')}
                    {plan.schedule_type === 'sequential' &&
                      (plan.sequence_position?.session_name ||
                        plan.next_assignment?.session_name) &&
                      plan.sequence_position && (
                        <Text className="text-text-muted font-normal">
                          {' '}
                          ({plan.sequence_position.current}/
                          {plan.sequence_position.total})
                        </Text>
                      )}
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center justify-between">
                {distinctSessions.length > 1 ? (
                  <View className="flex-1 mr-2">
                    <BottomSheetPicker
                      value={String(currentAssignment.id)}
                      options={sessionOptions}
                      title={t(
                        'exerciseSummary.selectSession',
                        'Select Session'
                      )}
                      onSelect={(val) =>
                        setSelectedSessionMap((prev) => ({
                          ...prev,
                          [plan.id]: String(val),
                        }))
                      }
                      renderTrigger={({ onPress }) => (
                        <Pressable
                          onPress={onPress}
                          accessibilityRole="button"
                          className="flex-row items-center gap-1.5 py-0.5 active:opacity-70"
                        >
                          <Text
                            className="text-text-primary text-base font-bold shrink"
                            numberOfLines={1}
                          >
                            {sessionTitle}
                          </Text>
                          <Icon
                            name="chevron-down"
                            size={14}
                            color={activeMuted}
                          />
                        </Pressable>
                      )}
                    />
                  </View>
                ) : (
                  <Text
                    className="text-text-primary text-base font-bold flex-1 mr-2"
                    numberOfLines={1}
                  >
                    {sessionTitle}
                  </Text>
                )}

                {onPressPlanAssignment && (
                  <Pressable
                    onPress={() =>
                      onPressPlanAssignment(plan, currentAssignment)
                    }
                    accessibilityRole="button"
                    className="px-3.5 py-1.5 rounded-lg flex-row items-center gap-1.5 active:opacity-80 shadow-sm"
                    style={{ backgroundColor: activeAccent }}
                  >
                    <Icon name="play" size={13} color="#ffffff" />
                    <Text className="text-white text-xs font-bold">
                      {t('exerciseSummary.startWorkout', {
                        defaultValue: 'Start',
                      })}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
      </View>
    ) : null;
  const planBanners = (
    <>
      {programBanner}
      {planBannersOnly}
    </>
  );

  if (exerciseEntries.length === 0) {
    const emptyContent = (
      <Text className="text-text-muted text-base">
        {t('exerciseSummary.tapToAdd', { defaultValue: 'Tap to add exercise' })}
      </Text>
    );
    return (
      <View>
        {planBanners}
        {onAddExercise ? (
          <Pressable
            onPress={onAddExercise}
            accessibilityRole="button"
            accessibilityLabel={t('exerciseSummary.addExercise', {
              defaultValue: 'Add exercise',
            })}
            className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6"
          >
            {emptyContent}
          </Pressable>
        ) : (
          <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6">
            {emptyContent}
          </View>
        )}
      </View>
    );
  }

  return (
    <View>
      {planBanners}
      <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm overflow-hidden">
        <View className="flex-row items-center gap-2 mb-2">
          <Icon name="exercise" size={18} color={accentPrimary} />
          <Text className="text-base font-bold text-text-secondary">
            {t('exerciseSummary.title', { defaultValue: 'Exercise' })}
          </Text>
        </View>
        {exerciseEntries.map((session, index) => (
          <SwipeableExerciseRow
            key={session.id || index}
            session={session}
            entryDate={entryDate}
            onPress={() => onPressWorkout?.(session)}
            getImageSource={getImageSource}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
          />
        ))}
      </View>
    </View>
  );
};

export default ExerciseSummary;
