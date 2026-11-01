import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import {
  DEFAULT_DROP_SET_COUNT,
  DEFAULT_DROP_SET_PERCENT,
  findDropSetBaseIndex,
  usesBarbell,
} from '@workspace/shared';
import type { WeightUnit } from '@/contexts/PreferencesContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  WORKOUT_PLAYBACK_SET_GRID_CLASSES,
  type WorkoutPlaybackExerciseDraft,
  type WorkoutSetEditableField,
  type WorkoutSetPointer,
} from '@/utils/workoutPlayback';
import WorkoutPlaybackSetRow from './WorkoutPlaybackSetRow';
import AdaptiveSuggestionNotice from './AdaptiveSuggestionNotice';
import ImageLightbox from '@/components/ImageLightbox';
import { PlateCalculatorDialog } from '@/components/PlateCalculator/PlateCalculatorDialog';
import {
  filterValidExerciseImages,
  resolveExerciseImageSrc,
} from '@/utils/exercises';

interface WorkoutPlaybackExercisesListProps {
  exercises: WorkoutPlaybackExerciseDraft[];
  setNotesVisibility: Record<string, boolean>;
  onToggleSetNotesVisibility: (setKey: string) => void;
  onSelectSet: (pointer: WorkoutSetPointer) => void;
  onCompleteSet: (pointer: WorkoutSetPointer) => void;
  onUncompleteSet: (pointer: WorkoutSetPointer) => void;
  onSetFieldChange: (
    pointer: WorkoutSetPointer,
    field: WorkoutSetEditableField,
    value: number | string | null
  ) => void;
  onOpenRestEditor: (pointer: WorkoutSetPointer) => void;
  onRemoveSet: (pointer: WorkoutSetPointer) => void;
  onAddSet: (exerciseIndex: number) => void;
  onAddDropSets?: (exerciseIndex: number) => void;
  /** Swap the exercise for an alternative (issue #1560). */
  onReplaceExercise?: (exerciseIndex: number) => void;
  /** "Use my usual" / "Use the adjusted suggestion" (#1560). */
  onAdaptiveDeclined?: (exerciseIndex: number, declined: boolean) => void;
  weightUnit: WeightUnit;
}

const WorkoutPlaybackExercisesList = ({
  exercises,
  setNotesVisibility,
  onToggleSetNotesVisibility,
  onSelectSet,
  onCompleteSet,
  onUncompleteSet,
  onSetFieldChange,
  onOpenRestEditor,
  onRemoveSet,
  onAddSet,
  onAddDropSets,
  onReplaceExercise,
  onAdaptiveDeclined,
  weightUnit,
}: WorkoutPlaybackExercisesListProps) => {
  const { t } = useTranslation();
  const [expandedCompletedExercises, setExpandedCompletedExercises] = useState<
    Record<string, boolean>
  >({});
  // Full-screen exercise images (#1691), opened from a header thumbnail.
  const [imageViewer, setImageViewer] = useState<{
    images: string[];
    title: string;
  } | null>(null);
  // The set the plate calculator is open for.
  const [plateTarget, setPlateTarget] = useState<WorkoutSetPointer | null>(
    null
  );
  const plateExercise =
    plateTarget != null ? exercises[plateTarget.exerciseIndex] : undefined;

  return (
    <div className="space-y-2">
      {exercises.map((exercise, exerciseIndex) => {
        const isTimedExercise = exercise.modality
          ? exercise.modality === 'duration' ||
            exercise.modality === 'duration_distance'
          : exercise.sets.some(
              (set) => set.duration != null && set.reps == null
            );
        const completedSets = exercise.sets.filter(
          (set) => set.completed
        ).length;
        const totalSets = exercise.sets.length;
        const isComplete = totalSets > 0 && completedSets === totalSets;
        const exerciseKey = `${exercise.exercise_id}-${exerciseIndex}`;
        const isExpanded =
          !isComplete || expandedCompletedExercises[exerciseKey] === true;
        const exerciseImages = filterValidExerciseImages(
          exercise.images ?? (exercise.image_url ? [exercise.image_url] : [])
        ).map((image) => resolveExerciseImageSrc(image));
        const toggleLabel = isExpanded
          ? t('common.collapse', 'Collapse')
          : t('common.expand', 'Expand');

        return (
          <Card
            key={`${exercise.exercise_id}-${exerciseIndex}`}
            className="border-border/70 shadow-none"
          >
            <CardHeader className="px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                {exerciseImages.length > 0 && (
                  <button
                    type="button"
                    className="shrink-0 overflow-hidden rounded-md"
                    aria-label={t(
                      'exercise.workoutPlaybackPage.viewImages',
                      'View {{name}} images',
                      { name: exercise.exercise_name }
                    )}
                    onClick={() =>
                      setImageViewer({
                        images: exerciseImages,
                        title: exercise.exercise_name,
                      })
                    }
                  >
                    <img
                      src={exerciseImages[0]}
                      alt=""
                      className="h-10 w-10 object-cover"
                      loading="lazy"
                    />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">
                    {exercise.exercise_name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      'exercise.workoutPlaybackPage.sets',
                      '{{completedSets}}/{{totalSets}} sets',
                      { completedSets, totalSets }
                    )}
                  </p>
                </div>
                {onReplaceExercise && (
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t(
                      'exercise.workoutPlaybackPage.replaceExercise',
                      'Replace exercise'
                    )}
                    aria-label={t(
                      'exercise.workoutPlaybackPage.replaceExerciseNamed',
                      'Replace {{name}}',
                      { name: exercise.exercise_name }
                    )}
                    onClick={() => onReplaceExercise(exerciseIndex)}
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1.5 text-left"
                  aria-label={`${toggleLabel} ${exercise.exercise_name}`}
                  onClick={() => {
                    if (!isComplete) return;
                    setExpandedCompletedExercises((current) => ({
                      ...current,
                      [exerciseKey]: !current[exerciseKey],
                    }));
                  }}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    } ${isComplete ? 'text-emerald-500' : ''}`}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {isComplete
                      ? t('exercise.workoutPlaybackPage.completed', 'Completed')
                      : t(
                          'exercise.workoutPlaybackPage.inProgress',
                          'In Progress'
                        )}
                  </span>
                </button>
              </div>
            </CardHeader>
            {(exercise.adaptive || exercise.suggest_variation) && (
              <div className="px-3 pb-2">
                <AdaptiveSuggestionNotice
                  adaptive={exercise.adaptive ?? null}
                  suggestVariation={exercise.suggest_variation === true}
                  onDeclinedChange={
                    onAdaptiveDeclined
                      ? (declined) =>
                          onAdaptiveDeclined(exerciseIndex, declined)
                      : undefined
                  }
                  onSeeAlternatives={
                    onReplaceExercise
                      ? () => onReplaceExercise(exerciseIndex)
                      : undefined
                  }
                />
              </div>
            )}
            {isExpanded && (
              <CardContent className="px-3 pb-2 pt-0">
                <div className="space-y-1">
                  <div className="hidden overflow-x-auto pb-1 sm:block">
                    <div
                      className={`text-[10px] font-medium text-muted-foreground ${WORKOUT_PLAYBACK_SET_GRID_CLASSES}`}
                    >
                      <div className="flex justify-center px-3">
                        {t('exercise.workoutPlaybackPage.columnSet', 'Set')}
                      </div>
                      <div className="flex justify-center px-3">
                        {t('exercise.workoutPlaybackPage.columnType', 'Type')}
                      </div>
                      {isTimedExercise ? (
                        <div className="flex justify-center px-3 sm:col-span-2">
                          {t('workout.durationSec', 'Duration (s)')}
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-center px-3">
                            {t(
                              'exercise.workoutPlaybackPage.columnReps',
                              'Reps'
                            )}
                          </div>
                          <div className="flex justify-center px-3">
                            {t(
                              'exercise.workoutPlaybackPage.columnWeight',
                              'Weight'
                            )}
                          </div>
                        </>
                      )}
                      <div className="flex justify-center px-3">
                        {t('exercise.workoutPlaybackPage.columnRest', 'Rest')}
                      </div>
                      <div className="flex justify-end px-3">
                        {t('common.actions', 'Actions')}
                      </div>
                    </div>
                  </div>

                  {exercise.sets.map((set, setIndex) => {
                    return (
                      <WorkoutPlaybackSetRow
                        key={`${exercise.exercise_id}-${exerciseIndex}-${setIndex}`}
                        exerciseName={exercise.exercise_name}
                        exerciseKey={exerciseKey}
                        exerciseIndex={exerciseIndex}
                        setIndex={setIndex}
                        setNumber={set.set_number}
                        setType={set.set_type}
                        isTimedExercise={isTimedExercise}
                        reps={set.reps}
                        weight={set.weight}
                        duration={set.duration}
                        timerStartedAtMs={set.timer_started_at_ms ?? null}
                        restTime={set.rest_time}
                        notes={set.notes}
                        completed={set.completed}
                        isNotesVisible={
                          setNotesVisibility[`${exerciseKey}-${setIndex}`] ??
                          false
                        }
                        onToggleNotesVisibility={onToggleSetNotesVisibility}
                        onSelectSet={onSelectSet}
                        onCompleteSet={onCompleteSet}
                        onUncompleteSet={onUncompleteSet}
                        onSetFieldChange={onSetFieldChange}
                        onOpenRestEditor={onOpenRestEditor}
                        onRemoveSet={onRemoveSet}
                        canRemove={exercise.sets.length > 1}
                        weightUnit={weightUnit}
                        canCalculatePlates={usesBarbell(exercise.equipment)}
                        onOpenPlateCalculator={setPlateTarget}
                      />
                    );
                  })}
                </div>

                <div className="mt-2 flex justify-center gap-3">
                  <button
                    type="button"
                    aria-label={t(
                      'diary.workoutPlaybackExercisesList.addSetFor',
                      'Add set for {{exercise_name}}',
                      { exercise_name: exercise.exercise_name }
                    )}
                    className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => onAddSet(exerciseIndex)}
                  >
                    {t('exercise.workoutPlaybackPage.addSet', 'Add Set')}
                  </button>
                  {findDropSetBaseIndex(exercise.sets) >= 0 && (
                    <button
                      type="button"
                      aria-label={t(
                        'exercise.workoutPlaybackPage.addDropSetsFor',
                        'Add drop sets for {{name}}',
                        { name: exercise.exercise_name }
                      )}
                      className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => onAddDropSets?.(exerciseIndex)}
                    >
                      {t(
                        'exercise.workoutPlaybackPage.addDropSets',
                        'Add {{sets}} Drop Sets (-{{percent}}%)',
                        {
                          sets: DEFAULT_DROP_SET_COUNT,
                          percent: DEFAULT_DROP_SET_PERCENT,
                        }
                      )}
                    </button>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
      {plateTarget != null && (
        <PlateCalculatorDialog
          open
          onOpenChange={(open) => {
            if (!open) setPlateTarget(null);
          }}
          weightKg={plateExercise?.sets[plateTarget.setIndex]?.weight}
          weightUnit={weightUnit}
          equipment={plateExercise?.equipment}
        />
      )}
      <ImageLightbox
        images={imageViewer?.images ?? []}
        open={imageViewer != null}
        onOpenChange={(open) => {
          if (!open) setImageViewer(null);
        }}
        title={imageViewer?.title}
      />
    </div>
  );
};

export default memo(WorkoutPlaybackExercisesList);
