import type {
  WorkoutPlanAssignment,
  WorkoutPreset,
  WorkoutPresetSet,
} from '@/types/workout';
import { Button } from '@/components/ui/button';
import { Plus, X, ListOrdered, GripVertical, Copy } from 'lucide-react';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ExerciseHistoryDisplay from '../../components/ExerciseHistoryDisplay';
import { TFunction } from 'i18next';
import { SortableSetItem } from '../Diary/ExerciseSortableItems';
export const SortableAssignmentItem = ({
  assignment,
  originalIndex,
  workoutPresets,
  handleCopyAssignment,
  handleRemoveAssignment,
  handleSetChangeInPlan,
  handleDuplicateSetInPlan,
  handleRemoveSetInPlan,
  handleAddSetInPlan,
  weightUnit,
  t,
}: {
  assignment: WorkoutPlanAssignment;
  originalIndex: number;
  workoutPresets: WorkoutPreset[];
  handleCopyAssignment: (assignment: WorkoutPlanAssignment) => void;
  handleRemoveAssignment: (index: number) => void;
  handleSetChangeInPlan: (
    assignmentIndex: number,
    setIndex: number,
    field: keyof WorkoutPresetSet,
    value: WorkoutPresetSet[keyof WorkoutPresetSet]
  ) => void;
  handleDuplicateSetInPlan: (assignmentIndex: number, setIndex: number) => void;
  handleRemoveSetInPlan: (assignmentIndex: number, setIndex: number) => void;
  handleAddSetInPlan: (assignmentIndex: number) => void;
  weightUnit: string;
  t: TFunction;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: (assignment.id || `assignment-${originalIndex}`) as string,
  });

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
      {assignment.workout_preset_id ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div {...listeners}>
              <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
            </div>
            <div>
              <h4 className="font-medium">
                {t('addWorkoutPlanDialog.presetLabel', 'Preset:')}{' '}
                {workoutPresets.find(
                  (p) => p.id === assignment.workout_preset_id
                )?.name || 'N/A'}
              </h4>
              {(() => {
                const preset = workoutPresets.find(
                  (p) => p.id === assignment.workout_preset_id
                );
                if (preset && preset.exercises && preset.exercises.length > 0) {
                  return (
                    <div className="text-xs text-muted-foreground mt-1">
                      {preset.exercises.slice(0, 10).map((ex, idx) => (
                        <p
                          key={idx}
                          className="flex flex-wrap items-center gap-x-4 gap-y-1"
                        >
                          <span className="font-medium">
                            {ex.exercise_name}
                          </span>
                          {ex.sets && (
                            <span className="flex items-center gap-1">
                              <ListOrdered className="h-3 w-3" />{' '}
                              {ex.sets.length}{' '}
                              {t('addWorkoutPlanDialog.setsLabel', 'sets')}
                            </span>
                          )}
                        </p>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>
          <div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleCopyAssignment(assignment)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleRemoveAssignment(originalIndex)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div {...listeners}>
                <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
              </div>
              <h4 className="font-semibold">{assignment.exercise_name}</h4>
            </div>
            <div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleCopyAssignment(assignment)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveAssignment(originalIndex)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <SortableContext
            items={assignment.sets.map((set) => set.id as string)}
          >
            <div className="space-y-2">
              {assignment.sets.map((set, setIndex) => (
                <SortableSetItem
                  key={set.id}
                  set={set}
                  setIndex={setIndex}
                  weightUnit={weightUnit}
                  handleSetChange={(si, field, value) =>
                    handleSetChangeInPlan(originalIndex, si, field, value)
                  }
                  handleDuplicateSet={(si) =>
                    handleDuplicateSetInPlan(originalIndex, si)
                  }
                  handleRemoveSet={(si) =>
                    handleRemoveSetInPlan(originalIndex, si)
                  }
                />
              ))}
            </div>
          </SortableContext>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleAddSetInPlan(originalIndex)}
          >
            <Plus className="h-4 w-4 mr-2" />{' '}
            {t('addWorkoutPlanDialog.addSetButton', 'Add Set')}
          </Button>
          <ExerciseHistoryDisplay exerciseId={assignment.exercise_id!} />
        </>
      )}
    </div>
  );
};
