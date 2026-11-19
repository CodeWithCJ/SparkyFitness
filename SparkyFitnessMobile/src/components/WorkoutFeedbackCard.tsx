import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  WORKOUT_FEEDBACK_DIFFICULTIES,
  WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH,
  type WorkoutFeedbackDifficulty,
} from '@workspace/shared';
import Icon from './Icon';
import { useWorkoutSessionFeedback } from '../hooks/useWorkoutSessionFeedback';

interface FeedbackExercise {
  /** Exercise entry id. */
  id: string;
  name: string;
}

interface WorkoutFeedbackCardProps {
  presetEntryId: string;
  exercises: FeedbackExercise[];
}

export function difficultyLabel(
  t: TFunction,
  difficulty: WorkoutFeedbackDifficulty
): string {
  switch (difficulty) {
    case 'too_easy':
      return t('workoutFeedback.difficulty.tooEasy', {
        defaultValue: 'Too easy',
      });
    case 'just_right':
      return t('workoutFeedback.difficulty.justRight', {
        defaultValue: 'Just right',
      });
    case 'too_hard':
      return t('workoutFeedback.difficulty.tooHard', {
        defaultValue: 'Too hard',
      });
  }
}

function Chip({
  label,
  selected,
  onPress,
  small = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-full border items-center ${
        small ? 'px-2.5 py-1' : 'flex-1 px-3 py-2'
      } ${
        selected
          ? 'border-accent-primary bg-accent-primary'
          : 'border-border-subtle bg-raised'
      }`}
    >
      <Text
        className={`${small ? 'text-xs' : 'text-sm'} font-medium ${
          selected ? 'text-white' : 'text-text-primary'
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * "How did it feel?" — end-of-workout feedback that adaptive suggestions
 * learn from (issue #1560). Every answer autosaves.
 */
const WorkoutFeedbackCard: React.FC<WorkoutFeedbackCardProps> = ({
  presetEntryId,
  exercises,
}) => {
  const { t } = useTranslation();
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const { draft, update, retry, saveState, isLoading, isError, reload } =
    useWorkoutSessionFeedback(presetEntryId);
  const [showPerExercise, setShowPerExercise] = useState(
    () => Object.keys(draft.exerciseDifficulty).length > 0
  );

  if (isLoading) return null;
  // Every save replaces the whole session's feedback, so answering from an
  // empty form after a failed load would erase what is already saved.
  if (isError) {
    return (
      <Pressable
        className="bg-surface rounded-2xl p-4 mt-4"
        onPress={() => void reload()}
        accessibilityRole="button"
      >
        <Text className="text-sm text-text-secondary">
          {t('workoutFeedback.loadFailed', {
            defaultValue: "Couldn't load your feedback. Tap to try again.",
          })}
        </Text>
      </Pressable>
    );
  }

  const toggle = <T,>(current: T | null, value: T): T | null =>
    current === value ? null : value;

  const statusText =
    saveState === 'saving'
      ? t('workoutFeedback.saving', { defaultValue: 'Saving…' })
      : saveState === 'saved'
        ? t('workoutFeedback.saved', { defaultValue: 'Saved' })
        : saveState === 'queued'
          ? t('workoutFeedback.queued', {
              defaultValue: 'Will be sent when you are back online',
            })
          : null;

  return (
    <View
      className="bg-surface rounded-2xl p-4 mt-4"
      testID="workout-feedback-card"
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-base font-semibold text-text-primary">
          {t('workoutFeedback.title', { defaultValue: 'How did it feel?' })}
        </Text>
        {statusText && (
          <Text className="text-xs text-text-muted">{statusText}</Text>
        )}
      </View>
      <Text className="text-xs text-text-secondary mb-3">
        {t('workoutFeedback.subtitle', {
          defaultValue: 'Your next suggestions adjust to this.',
        })}
      </Text>

      <View className="flex-row gap-2">
        {WORKOUT_FEEDBACK_DIFFICULTIES.map((difficulty) => (
          <Chip
            key={difficulty}
            label={difficultyLabel(t, difficulty)}
            selected={draft.difficulty === difficulty}
            onPress={() =>
              update((current) => ({
                ...current,
                difficulty: toggle(current.difficulty, difficulty),
              }))
            }
          />
        ))}
      </View>

      <View className="flex-row items-center justify-between mt-4">
        <Text className="text-sm text-text-primary flex-1 pr-3">
          {t('workoutFeedback.painQuestion', {
            defaultValue: 'Any pain or discomfort?',
          })}
        </Text>
        <Switch
          value={draft.pain}
          onValueChange={(pain) => update((current) => ({ ...current, pain }))}
          trackColor={{ true: accentColor }}
          accessibilityLabel={t('workoutFeedback.painQuestion', {
            defaultValue: 'Any pain or discomfort?',
          })}
        />
      </View>

      {draft.pain && (
        <View className="mt-3">
          {exercises.length > 0 && (
            <>
              <Text className="text-xs text-text-secondary mb-2">
                {t('workoutFeedback.painWhere', {
                  defaultValue: 'During which exercises? (optional)',
                })}
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {exercises.map((exercise) => {
                  const selected = draft.painExerciseEntryIds.includes(
                    exercise.id
                  );
                  return (
                    <Chip
                      key={exercise.id}
                      small
                      label={exercise.name}
                      selected={selected}
                      onPress={() =>
                        update((current) => ({
                          ...current,
                          painExerciseEntryIds: selected
                            ? current.painExerciseEntryIds.filter(
                                (id) => id !== exercise.id
                              )
                            : [...current.painExerciseEntryIds, exercise.id],
                        }))
                      }
                    />
                  );
                })}
              </View>
            </>
          )}
          <TextInput
            className="bg-raised rounded-lg px-3 py-2 text-text-primary"
            placeholder={t('workoutFeedback.painNotePlaceholder', {
              defaultValue: 'What hurt? (optional)',
            })}
            placeholderTextColor={textMuted}
            value={draft.painNote}
            maxLength={WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH}
            multiline
            onChangeText={(painNote) =>
              update((current) => ({ ...current, painNote }), {
                debounce: true,
              })
            }
          />
          <Text className="text-xs text-text-muted mt-2">
            {t('workoutFeedback.painPrivacy', {
              defaultValue:
                'Suggestions for these exercises get lighter, never heavier.',
            })}
          </Text>
        </View>
      )}

      {exercises.length > 0 && (
        <Pressable
          className="flex-row items-center mt-4"
          onPress={() => setShowPerExercise((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showPerExercise }}
        >
          <Text className="text-sm font-medium text-accent-primary flex-1">
            {t('workoutFeedback.rateExercises', {
              defaultValue: 'Rate each exercise',
            })}
          </Text>
          <Icon
            name={showPerExercise ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={accentColor}
          />
        </Pressable>
      )}

      {showPerExercise &&
        exercises.map((exercise) => {
          const current = draft.exerciseDifficulty[exercise.id] ?? null;
          return (
            <View key={exercise.id} className="mt-3">
              <Text
                className="text-sm text-text-primary mb-1.5"
                numberOfLines={1}
              >
                {exercise.name}
              </Text>
              <View className="flex-row gap-2">
                {WORKOUT_FEEDBACK_DIFFICULTIES.map((difficulty) => (
                  <Chip
                    key={difficulty}
                    small
                    label={difficultyLabel(t, difficulty)}
                    selected={current === difficulty}
                    onPress={() =>
                      update((value) => ({
                        ...value,
                        exerciseDifficulty: {
                          ...value.exerciseDifficulty,
                          [exercise.id]: toggle(current, difficulty),
                        },
                      }))
                    }
                  />
                ))}
              </View>
            </View>
          );
        })}

      {saveState === 'error' && (
        <Pressable
          onPress={() => void retry()}
          accessibilityRole="button"
          className="mt-3"
        >
          <Text className="text-sm text-text-danger-subtle">
            {t('workoutFeedback.saveFailed', {
              defaultValue: "Couldn't save your feedback. Tap to retry.",
            })}
          </Text>
        </Pressable>
      )}
    </View>
  );
};

export default WorkoutFeedbackCard;
