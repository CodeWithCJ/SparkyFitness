import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  WORKOUT_PLAYBACK_SET_GRID_CLASSES,
  type WorkoutPlaybackExerciseDraft,
  type WorkoutSetPointer,
} from '@/utils/workoutPlayback';
import WorkoutPlaybackSetRow from './WorkoutPlaybackSetRow';

interface WorkoutPlaybackExercisesListProps {
  exercises: WorkoutPlaybackExerciseDraft[];
  setNotesVisibility: Record<string, boolean>;
  onToggleSetNotesVisibility: (setKey: string) => void;
  onSelectSet: (pointer: WorkoutSetPointer) => void;
  onCompleteSet: (pointer: WorkoutSetPointer) => void;
  onUncompleteSet: (pointer: WorkoutSetPointer) => void;
  onSetFieldChange: (
    pointer: WorkoutSetPointer,
    field: 'reps' | 'weight' | 'rest_time' | 'set_type' | 'notes',
    value: number | string | null
  ) => void;
  onOpenRestEditor: (pointer: WorkoutSetPointer) => void;
  onRemoveSet: (pointer: WorkoutSetPointer) => void;
  onAddSet: (exerciseIndex: number) => void;
  weightUnit: string;
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
  weightUnit,
}: WorkoutPlaybackExercisesListProps) => {
  const { t } = useTranslation();
  const [expandedCompletedExercises, setExpandedCompletedExercises] = useState<
    Record<string, boolean>
  >({});

  return (
    <div className="space-y-2">
      {exercises.map((exercise, exerciseIndex) => {
        const completedSets = exercise.sets.filter(
          (set) => set.completed
        ).length;
        const totalSets = exercise.sets.length;
        const isComplete = totalSets > 0 && completedSets === totalSets;
        const exerciseKey = `${exercise.exercise_id}-${exerciseIndex}`;
        const isExpanded =
          !isComplete || expandedCompletedExercises[exerciseKey] === true;
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
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-medium">
                    {exercise.exercise_name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {completedSets}/{totalSets}{' '}
                    {t('exercise.workoutPlaybackDialog.sets', 'sets')}
                  </p>
                </div>
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
                      <div className="flex justify-center px-3">
                        {t('exercise.workoutPlaybackPage.columnReps', 'Reps')}
                      </div>
                      <div className="flex justify-center px-3">
                        {t(
                          'exercise.workoutPlaybackPage.columnWeight',
                          'Weight'
                        )}
                      </div>
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
                        reps={set.reps}
                        weight={set.weight}
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
                      />
                    );
                  })}
                </div>

                <div className="mt-2 flex justify-center">
                  <button
                    type="button"
                    aria-label={`Add set for ${exercise.exercise_name}`}
                    className="inline-flex items-center justify-center px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => onAddSet(exerciseIndex)}
                  >
                    {t('exercise.workoutPlaybackPage.addSet', 'Add Set')}
                  </button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default memo(WorkoutPlaybackExercisesList);
