import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  GripVertical,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Copy,
  Book,
  Dumbbell,
  HeartPulse,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ExerciseHistoryDisplay from '@/components/ExerciseHistoryDisplay';
import { SortableSetItem } from './SortableWorkoutSet';
import { CardioLog } from './CardioLog';
import type {
  WorkoutPreset,
  SetFieldKey,
  SortableSetData,
  SortableExerciseItemData,
} from '@/types/workout';
import { PresetSessionResponse } from '@workspace/shared';
import { SetColumnHeaders } from './SetHeader';
import { usePreferences } from '@/contexts/PreferencesContext';

type PresetMetadata = WorkoutPreset | PresetSessionResponse;

interface SortableExerciseItemProps {
  ex: SortableExerciseItemData;
  exerciseIndex: number;
  onRemoveExercise: (index: number) => void;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: SetFieldKey,
    value: string | number | null | undefined
  ) => void;
  onDuplicateSet: (exerciseIndex: number, setIndex: number) => void;
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void;
  onAddSet?: (exerciseIndex: number) => void;
  onCopyExercise?: (ex: SortableExerciseItemData) => void;
  onReorderSets?: (
    exerciseIndex: number,
    oldIndex: number,
    newIndex: number
  ) => void;
  weightUnit: string;
  workoutPresets?: PresetMetadata[];
  simplified?: boolean;
}

export const SortableExerciseItem = ({
  ex,
  exerciseIndex,
  onRemoveExercise,
  onSetChange,
  onDuplicateSet,
  onRemoveSet,
  onAddSet,
  onCopyExercise,
  onReorderSets,
  weightUnit,
  workoutPresets,
  simplified = false,
}: SortableExerciseItemProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { distanceUnit } = usePreferences();

  const sortableId = ex.id?.toString() || `ex-${exerciseIndex}`;

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isCardio = ex.category === 'cardio';
  const hasSets = Array.isArray(ex.sets) && ex.sets.length > 0;

  const displayName =
    ('exercise_name' in ex && ex.exercise_name) ||
    ('workout_preset_name' in ex && ex.workout_preset_name) ||
    ('exercise_snapshot' in ex && ex.exercise_snapshot?.name) ||
    'Workout';

  const isWorkoutPreset =
    'workout_preset_id' in ex && !!ex.workout_preset_id && !ex.exercise_id;

  const linkedPreset = useMemo(
    () =>
      workoutPresets?.find((p) => {
        const pId = p.id.toString();
        const exPresetId =
          ('workout_preset_id' in ex && ex.workout_preset_id?.toString()) ||
          ('exercise_preset_entry_id' in ex &&
            ex.exercise_preset_entry_id?.toString());
        return pId === exPresetId;
      }),
    [workoutPresets, ex]
  );

  const cardioSet = ex.sets?.[0];
  const cardioDuration =
    ('duration_minutes' in ex ? ex.duration_minutes : undefined) ??
    cardioSet?.duration ??
    '';
  const cardioDistance = ('distance' in ex ? ex.distance : undefined) ?? '';
  const cardioCalories =
    ('calories_burned' in ex ? ex.calories_burned : undefined) ?? '';
  const cardioHr =
    ('avg_heart_rate' in ex ? ex.avg_heart_rate : undefined) ?? '';
  const cardioRpe = cardioSet?.rpe ?? '';

  const handleCardioSetChange = (
    field: SetFieldKey,
    value: string | number | null | undefined
  ) => {
    onSetChange(exerciseIndex, 0, field, value);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSetDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id && ex.sets) {
      const oldIndex = ex.sets.findIndex((s, i) => {
        const setWithId = s as typeof s & {
          _dndId?: string;
          id?: string | number;
        };
        return (
          (setWithId._dndId ||
            setWithId.id?.toString() ||
            `set-${exerciseIndex}-${i}`) === active.id
        );
      });
      const newIndex = ex.sets.findIndex((s, i) => {
        const setWithId = s as typeof s & {
          _dndId?: string;
          id?: string | number;
        };
        return (
          (setWithId._dndId ||
            setWithId.id?.toString() ||
            `set-${exerciseIndex}-${i}`) === over.id
        );
      });

      if (oldIndex !== -1 && newIndex !== -1 && onReorderSets) {
        onReorderSets(exerciseIndex, oldIndex, newIndex);
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border p-3 rounded-md space-y-3 bg-card"
      {...attributes}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div {...listeners}>
            <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              {isWorkoutPreset ? (
                <Book className="h-4 w-4 text-primary" />
              ) : isCardio ? (
                <HeartPulse className="h-4 w-4 text-red-500" />
              ) : (
                <Dumbbell className="h-4 w-4 text-muted-foreground" />
              )}
              <h4 className="font-bold text-sm leading-tight">{displayName}</h4>
            </div>
            {linkedPreset && (
              <div className="flex items-center text-[10px] text-muted-foreground uppercase mt-0.5 font-medium">
                {linkedPreset.name}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-1">
          {(hasSets || isCardio) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
          {onCopyExercise && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onCopyExercise(ex)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => onRemoveExercise(exerciseIndex)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && isCardio && (
        <CardioLog
          simplified={simplified}
          durationMinutes={cardioDuration as number | ''}
          distance={cardioDistance as number | ''}
          caloriesBurned={cardioCalories as number | ''}
          avgHeartRate={cardioHr as number | ''}
          rpe={cardioRpe as number | ''}
          distanceUnit={distanceUnit}
          onDurationChange={(v) =>
            handleCardioSetChange('duration', v === '' ? undefined : Number(v))
          }
          onDistanceChange={(v) =>
            handleCardioSetChange(
              'distance' as SetFieldKey,
              v === '' ? null : Number(v)
            )
          }
          onCaloriesChange={(v) =>
            handleCardioSetChange(
              'calories' as SetFieldKey,
              v === '' ? null : Number(v)
            )
          }
          onAvgHeartRateChange={(v) =>
            handleCardioSetChange(
              'avg_heart_rate' as SetFieldKey,
              v === '' ? null : Number(v)
            )
          }
          onRpeChange={(v) =>
            handleCardioSetChange('rpe', v === '' ? null : Number(v))
          }
        />
      )}

      {isExpanded && !isCardio && hasSets && (
        <div className="space-y-3">
          <SetColumnHeaders category={ex?.category} />
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSetDragEnd}
          >
            <SortableContext
              items={(ex.sets || []).map((s, i) => {
                const setWithId = s as typeof s & {
                  _dndId?: string;
                  id?: string | number;
                };
                return (
                  setWithId._dndId ||
                  setWithId.id?.toString() ||
                  `set-${exerciseIndex}-${i}`
                );
              })}
            >
              <div className="space-y-2">
                {(ex.sets || []).map((s, setIndex) => {
                  const setWithId = s as typeof s & {
                    _dndId?: string;
                    id?: string | number;
                  };
                  const dndId =
                    setWithId._dndId ||
                    setWithId.id?.toString() ||
                    `set-${exerciseIndex}-${setIndex}`;
                  return (
                    <SortableSetItem
                      key={dndId}
                      id={dndId}
                      set={s as SortableSetData}
                      exerciseIndex={exerciseIndex}
                      setIndex={setIndex}
                      onSetChange={onSetChange}
                      onDuplicateSet={onDuplicateSet}
                      onRemoveSet={onRemoveSet}
                      weightUnit={weightUnit}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          <div className="flex justify-between items-center mt-2 border-t pt-2">
            {onAddSet && !isWorkoutPreset ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => onAddSet(exerciseIndex)}
              >
                <Plus className="h-3 w-3 mr-2" /> Add Set
              </Button>
            ) : (
              <div />
            )}
            {ex.exercise_id && (
              <ExerciseHistoryDisplay exerciseId={ex.exercise_id} />
            )}
          </div>
        </div>
      )}

      {isWorkoutPreset && (
        <p className="text-[11px] text-muted-foreground italic px-7">
          Workout Preset block: Edit individual exercises within the preset
          manager.
        </p>
      )}
    </div>
  );
};
