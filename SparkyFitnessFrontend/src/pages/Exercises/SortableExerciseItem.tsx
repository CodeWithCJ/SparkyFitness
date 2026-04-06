import { Button } from '@/components/ui/button';
import type { WorkoutPresetExercise, WorkoutPresetSet } from '@/types/workout';
import { GripVertical, Plus, X } from 'lucide-react';

import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ExerciseHistoryDisplay from '@/components/ExerciseHistoryDisplay';
import { t } from 'i18next';
import { SortableSetItem } from './SortableWorkoutPresetSet';

export const SortableExerciseItem = ({
  ex,
  exerciseIndex,
  handleRemoveExercise,
  handleSetChange,
  handleDuplicateSet,
  handleRemoveSet,
  handleAddSet,
  weightUnit,
}: {
  ex: WorkoutPresetExercise;
  exerciseIndex: number;
  handleRemoveExercise: (index: number) => void;
  handleSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: keyof WorkoutPresetSet,
    value: WorkoutPresetSet[keyof WorkoutPresetSet]
  ) => void;
  handleDuplicateSet: (exerciseIndex: number, setIndex: number) => void;
  handleRemoveSet: (exerciseIndex: number, setIndex: number) => void;
  handleAddSet: (exerciseIndex: number) => void;
  weightUnit: string;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ex.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border p-4 rounded-md space-y-4 bg-card"
      {...attributes}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div {...listeners}>
            <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
          </div>
          <h4 className="font-semibold">{ex.exercise_name}</h4>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleRemoveExercise(exerciseIndex)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <SortableContext items={ex.sets.map((s) => s.id!)}>
        <div className="space-y-2">
          {ex.sets.map((set, setIndex) => (
            <SortableSetItem
              key={set.id}
              set={set}
              exerciseIndex={exerciseIndex}
              setIndex={setIndex}
              onSetChange={handleSetChange}
              onDuplicateSet={handleDuplicateSet}
              onRemoveSet={handleRemoveSet}
              weightUnit={weightUnit}
            />
          ))}
        </div>
      </SortableContext>
      <Button
        type="button"
        variant="outline"
        onClick={() => handleAddSet(exerciseIndex)}
      >
        <Plus className="h-4 w-4 mr-2" />{' '}
        {t('workoutPresetForm.addSetButton', 'Add Set')}
      </Button>
      <ExerciseHistoryDisplay exerciseId={ex.exercise_id} />
    </div>
  );
};
