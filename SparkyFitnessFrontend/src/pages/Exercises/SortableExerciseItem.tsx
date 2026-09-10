import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  GripVertical,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Copy,
  CopyPlus,
  Repeat,
  Book,
  Dumbbell,
  HeartPulse,
  Trophy,
  Layers,
  StickyNote,
  Info, // <-- Added Info icon
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
import {
  PresetSessionResponse,
  resolveExerciseModality,
} from '@workspace/shared';
import { SetColumnHeaders } from './SetHeader';
import { toSetTableModality } from '@/constants/exercises';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

type PresetMetadata = WorkoutPreset | PresetSessionResponse;

const SUPERSET_COLORS: Record<
  number,
  { border: string; bg: string; text: string; label: string }
> = {
  1: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    label: 'SUPERSET A',
  },
  2: {
    border: 'border-l-purple-500',
    bg: 'bg-purple-500/15',
    text: 'text-purple-400',
    label: 'SUPERSET B',
  },
  3: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-400',
    label: 'SUPERSET C',
  },
  4: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    label: 'SUPERSET D',
  },
};

interface SortableExerciseItemProps {
  ex: SortableExerciseItemData & {
    progression_mode?: 'rep_goal' | 'fixed' | 'step_load' | 'manual' | null;
    rep_goal?: number | null;
    increment_type?: 'weight' | 'reps' | null;
    increment_value?: number | null;
    equipment_brand?: string | null;
    superset_group?: number | null;
    notes?: string | null;
  };
  exerciseIndex: number;
  onRemoveExercise: (index: number) => void;
  onSetChange: (
    exerciseIndex: number,
    setIndex: number,
    field: any,
    value: any
  ) => void;
  onDuplicateSet: (exerciseIndex: number, setIndex: number) => void;
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void;
  onAddSet?: (exerciseIndex: number) => void;
  onCopyExercise?: (ex: SortableExerciseItemData) => void;
  onReplaceExercise?: (exerciseIndex: number) => void;
  onDuplicateExercise?: (exerciseIndex: number) => void;
  onReorderSets?: (
    exerciseIndex: number,
    oldIndex: number,
    newIndex: number
  ) => void;
  onExerciseFieldChange?: (
    exerciseIndex: number,
    field: string,
    value: string | number | null
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
  onReplaceExercise,
  onDuplicateExercise,
  onReorderSets,
  onExerciseFieldChange,
  weightUnit,
  workoutPresets,
  simplified = false,
}: SortableExerciseItemProps) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const { distanceUnit } = usePreferences();

  // Local React State
  const [progressionMode, setProgressionMode] = useState<
    'rep_goal' | 'fixed' | 'step_load' | 'manual'
  >(ex.progression_mode ?? 'rep_goal');
  const [repGoal, setRepGoal] = useState<string>(
    ex.rep_goal != null ? String(ex.rep_goal) : ''
  );
  const [incrementType, setIncrementType] = useState<'weight' | 'reps'>(
    ex.increment_type ?? 'weight'
  );
  const [incrementValue, setIncrementValue] = useState<string>(
    ex.increment_value != null ? String(ex.increment_value) : '5'
  );
  const [equipmentBrand, setEquipmentBrand] = useState<string>(
    ex.equipment_brand ?? ''
  );
  const [supersetGroup, setSupersetGroup] = useState<number | null>(
    ex.superset_group ?? null
  );
  const [notes, setNotes] = useState<string>(ex.notes ?? '');

  const sortableId = ex.id?.toString() || `ex-${exerciseIndex}`;

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const modality = resolveExerciseModality(
    'exercise_snapshot' in ex ? ex.exercise_snapshot?.modality : ex.modality,
    ex.category
  );
  const isCardio = modality === 'duration_distance';
  const setTableModality = toSetTableModality(modality);
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
    (cardioSet?.duration != null ? cardioSet.duration / 60 : undefined) ??
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

  const handleModeChange = (
    val: 'rep_goal' | 'fixed' | 'step_load' | 'manual'
  ) => {
    setProgressionMode(val);
    ex.progression_mode = val;
    if (val === 'step_load') {
      setIncrementType('reps');
      ex.increment_type = 'reps';
    }
    onExerciseFieldChange?.(exerciseIndex, 'progression_mode', val);
  };

  const handleRepGoalChange = (text: string) => {
    setRepGoal(text);
    const num = text ? parseInt(text, 10) : null;
    ex.rep_goal = isNaN(num as number) ? null : num;
    onExerciseFieldChange?.(exerciseIndex, 'rep_goal', ex.rep_goal);
  };

  const handleIncrementTypeChange = (type: 'weight' | 'reps') => {
    setIncrementType(type);
    ex.increment_type = type;
    onExerciseFieldChange?.(exerciseIndex, 'increment_type', type);
  };

  const handleIncrementValueChange = (text: string) => {
    setIncrementValue(text);
    const num = text ? parseFloat(text) : 5;
    ex.increment_value = isNaN(num) ? 5 : num;
    onExerciseFieldChange?.(
      exerciseIndex,
      'increment_value',
      ex.increment_value
    );
  };

  const handleEquipmentChange = (text: string) => {
    setEquipmentBrand(text);
    ex.equipment_brand = text.trim() || null;
    onExerciseFieldChange?.(
      exerciseIndex,
      'equipment_brand',
      ex.equipment_brand
    );
  };

  const handleSupersetChange = (val: string) => {
    const groupNum = val === 'none' ? null : parseInt(val, 10);
    setSupersetGroup(groupNum);
    ex.superset_group = groupNum;
    onExerciseFieldChange?.(exerciseIndex, 'superset_group', groupNum);
  };

  const handleNotesChange = (text: string) => {
    setNotes(text);
    ex.notes = text.trim() || null;
    onExerciseFieldChange?.(exerciseIndex, 'notes', ex.notes);
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

  const supersetConfig = supersetGroup
    ? (SUPERSET_COLORS[supersetGroup] ?? null)
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border p-3 rounded-md space-y-3 bg-card transition-colors ${
        supersetConfig ? `border-l-4 ${supersetConfig.border}` : ''
      }`}
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
              {supersetConfig && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${supersetConfig.bg} ${supersetConfig.text}`}
                >
                  {supersetConfig.label}
                </span>
              )}
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
          {onReplaceExercise && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={t(
                'workoutPresetForm.replaceExerciseButton',
                'Replace exercise'
              )}
              aria-label={t(
                'workoutPresetForm.replaceExerciseButton',
                'Replace exercise'
              )}
              onClick={() => onReplaceExercise(exerciseIndex)}
            >
              <Repeat className="h-4 w-4" />
            </Button>
          )}
          {onDuplicateExercise && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={t(
                'workoutPresetForm.duplicateExerciseButton',
                'Duplicate exercise'
              )}
              aria-label={t(
                'workoutPresetForm.duplicateExerciseButton',
                'Duplicate exercise'
              )}
              onClick={() => onDuplicateExercise(exerciseIndex)}
            >
              <CopyPlus className="h-4 w-4" />
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

      {/* Per-Exercise Progression, Superset & Notes Settings Bar */}
      {!isWorkoutPreset && !isCardio && isExpanded && (
        <div className="bg-muted/40 p-3 rounded-lg border border-border/50 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2.5 items-end">
            <div>
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase mb-1 block">
                Progression Mode
              </Label>
              <select
                className="h-8 w-full text-xs rounded-md border border-input bg-background px-2 py-1 text-foreground"
                value={progressionMode}
                onChange={(e) =>
                  handleModeChange(
                    e.target.value as
                      'rep_goal' | 'fixed' | 'step_load' | 'manual'
                  )
                }
              >
                <option value="rep_goal">Total Rep Goal</option>
                <option value="fixed">Fixed Target</option>
                <option value="step_load">Step-Load (Reps Only)</option>
                <option value="manual">Manual (No Overload)</option>
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase">
                  Progression Mode
                </Label>
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(true)}
                  className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded"
                  title="Progression & Overload Guide"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>
              <select
                className="h-8 w-full text-xs rounded-md border border-input bg-background px-2 py-1 text-foreground"
                value={progressionMode}
                onChange={(e) =>
                  handleModeChange(
                    e.target.value as
                      'rep_goal' | 'fixed' | 'step_load' | 'manual'
                  )
                }
              >
                <option value="rep_goal">Total Rep Goal</option>
                <option value="fixed">Fixed Target</option>
                <option value="step_load">Step-Load (Reps Only)</option>
                <option value="manual">Manual (No Overload)</option>
              </select>
            </div>
            {/* Rep Goal Input: Only for rep_goal & step_load */}
            {(progressionMode === 'rep_goal' ||
              progressionMode === 'step_load') && (
              <div>
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                  <Trophy className="h-3 w-3 text-primary" />
                  Rep Goal (Total)
                </Label>
                <Input
                  type="number"
                  className="h-8 text-xs bg-background"
                  placeholder="e.g. 24"
                  value={repGoal}
                  onChange={(e) => handleRepGoalChange(e.target.value)}
                />
              </div>
            )}

            {/* Increment Type: Only for overload modes */}
            {progressionMode !== 'manual' &&
              progressionMode !== 'step_load' && (
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase mb-1 block">
                    Increment Type
                  </Label>
                  <select
                    className="h-8 w-full text-xs rounded-md border border-input bg-background px-2 py-1 text-foreground disabled:opacity-50"
                    value={incrementType}
                    onChange={(e) =>
                      handleIncrementTypeChange(
                        e.target.value as 'weight' | 'reps'
                      )
                    }
                  >
                    <option value="weight">Weight ({weightUnit})</option>
                    <option value="reps">Reps</option>
                  </select>
                </div>
              )}

            {/* Increment Amount */}
            {progressionMode !== 'manual' && (
              <div>
                <Label className="text-[11px] font-semibold text-muted-foreground uppercase mb-1 block">
                  {progressionMode === 'step_load' || incrementType === 'reps'
                    ? 'Increment (Reps)'
                    : `Increment (${weightUnit})`}
                </Label>
                <Input
                  type="number"
                  step="any"
                  className="h-8 text-xs bg-background"
                  placeholder="+5"
                  value={incrementValue}
                  onChange={(e) => handleIncrementValueChange(e.target.value)}
                />
              </div>
            )}

            {/* Superset Grouping */}
            <div>
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1 mb-1">
                <Layers className="h-3 w-3 text-primary" />
                Superset Group
              </Label>
              <select
                className="h-8 w-full text-xs rounded-md border border-input bg-background px-2 py-1 text-foreground"
                value={supersetGroup ? String(supersetGroup) : 'none'}
                onChange={(e) => handleSupersetChange(e.target.value)}
              >
                <option value="none">Solo (No Superset)</option>
                <option value="1">Superset A (Blue)</option>
                <option value="2">Superset B (Purple)</option>
                <option value="3">Superset C (Green)</option>
                <option value="4">Superset D (Amber)</option>
              </select>
            </div>

            {/* Equipment / Brand */}
            <div>
              <Label className="text-[11px] font-semibold text-muted-foreground uppercase mb-1 block">
                Equipment / Brand
              </Label>
              <Input
                type="text"
                className="h-8 text-xs bg-background"
                placeholder="e.g. Hammer Strength"
                value={equipmentBrand}
                onChange={(e) => handleEquipmentChange(e.target.value)}
              />
            </div>
          </div>

          {/* Exercise Notes Row */}
          <div>
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1 mb-1">
              <StickyNote className="h-3 w-3 text-primary" />
              Exercise Notes / Cues (Optional)
            </Label>
            <Input
              type="text"
              className="h-8 text-xs bg-background"
              placeholder="e.g. Seat setting 4, wide grip, pause at bottom..."
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
            />
          </div>
        </div>
      )}

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
            handleCardioSetChange(
              'duration',
              v === '' ? undefined : Math.round(Number(v) * 60)
            )
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
          <SetColumnHeaders modality={setTableModality} />
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
                      modality={setTableModality}
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
      {/* Progression & Overload Information Dialog */}
      <Dialog open={isGuideOpen} onOpenChange={setIsGuideOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-primary" />
              Progression & Overload Guide
            </DialogTitle>
            <DialogDescription>
              Understand progression techniques and configure automatic overload
              targets for your routine.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs leading-relaxed text-foreground">
            {/* Progression Modes */}
            <div className="space-y-2">
              <h4 className="font-bold text-sm text-primary uppercase tracking-wider">
                1. Progression Modes
              </h4>

              <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-1.5">
                <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  Total Rep Goal (Cumulative / Autoregulation)
                </div>
                <p className="text-muted-foreground">
                  Aim for a total rep threshold across all sets combined. As
                  sets progress and fatigue sets in (e.g. 18, 15, 15, 15, 15 =
                  78 reps), reaching your total rep goal automatically triggers
                  an overload weight bump for your next workout.
                </p>
                <p className="text-primary font-medium">
                  • Best for: Machines, cables, dumbbells, and hypertrophy
                  accessories.
                </p>
                <p className="text-muted-foreground italic">
                  • Example: Goal is 75 reps at 7.5 lbs. You hit 78 reps → Next
                  session auto-bumps to 10.0 lbs!
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-1.5">
                <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                  Fixed Target (All Sets Hit)
                </div>
                <p className="text-muted-foreground">
                  Every working set must reach or exceed the target rep number.
                  If any set falls short (e.g. 8, 8, 7 on an 8-rep target), the
                  load stays the same until all sets hit the target.
                </p>
                <p className="text-primary font-medium">
                  • Best for: Heavy barbell compound lifts (Bench Press, Squats,
                  Overhead Press).
                </p>
                <p className="text-muted-foreground italic">
                  • Example: Target 8 reps. You hit 8, 8, 8 → Next session
                  increases by your increment (+5 lbs).
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-1.5">
                <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Step-Load (Progress Reps Only)
                </div>
                <p className="text-muted-foreground">
                  Keeps the load fixed (e.g. bodyweight or fixed dumbbells) and
                  increments the target reps each time you achieve your rep goal
                  before moving to heavier equipment.
                </p>
                <p className="text-primary font-medium">
                  • Best for: Calisthenics (Pull-ups, Dips, Pushups) and core
                  exercises.
                </p>
                <p className="text-muted-foreground italic">
                  • Example: Target 40 reps at bodyweight, Increment 3 reps →
                  Next session targets 43 reps!
                </p>
              </div>

              <div className="p-3 rounded-lg border border-border/60 bg-muted/30 space-y-1.5">
                <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                  Manual (No Overload)
                </div>
                <p className="text-muted-foreground">
                  Disables automated overload math for warmups, deload weeks, or
                  freeform sessions.
                </p>
              </div>
            </div>

            {/* Input Fields Explained */}
            <div className="space-y-2 pt-2 border-t">
              <h4 className="font-bold text-sm text-primary uppercase tracking-wider">
                2. Configuration Fields & Examples
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-lg border border-border/50 bg-background space-y-1">
                  <span className="font-semibold text-foreground">
                    Rep Goal (Total)
                  </span>
                  <p className="text-muted-foreground">
                    The total rep ceiling for the exercise.
                  </p>
                  <p className="text-primary italic">
                    Examples: 24 (for 3×8), 45 (for 3×15), 75 (for 5×15).
                  </p>
                </div>

                <div className="p-2.5 rounded-lg border border-border/50 bg-background space-y-1">
                  <span className="font-semibold text-foreground">
                    Increment Amount
                  </span>
                  <p className="text-muted-foreground">
                    The weight or rep jump applied once the goal is hit.
                  </p>
                  <p className="text-primary italic">
                    Examples: +2.5 lbs (cables/micro-plates), +5.0 lbs
                    (dumbbells), +10.0 lbs (deadlifts).
                  </p>
                </div>

                <div className="p-2.5 rounded-lg border border-border/50 bg-background space-y-1">
                  <span className="font-semibold text-foreground">
                    Equipment / Brand
                  </span>
                  <p className="text-muted-foreground">
                    The machine or station branding. Leverages vary drastically
                    between manufacturers.
                  </p>
                  <p className="text-primary italic">
                    Examples: Hammer Strength, LifeFitness, Cable Stack,
                    Dumbbell, Power Rack.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg border border-border/50 bg-background space-y-1">
                  <span className="font-semibold text-foreground">
                    Exercise Notes / Cues
                  </span>
                  <p className="text-muted-foreground">
                    Equipment setup and form reminders.
                  </p>
                  <p className="text-primary italic">
                    Examples: Seat setting 4, pin 3, Wide grip, 2s pause at
                    chest.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
