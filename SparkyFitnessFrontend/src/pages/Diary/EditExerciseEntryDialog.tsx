import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, error } from '@/utils/logging';
import type { WorkoutPresetSet } from '@/types/workout';
import ExerciseActivityDetailsEditor from '@/components/ExerciseActivityDetailsEditor';
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
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { X, Plus, XCircle, ChevronDown } from 'lucide-react';
import ExerciseHistoryDisplay from '@/components/ExerciseHistoryDisplay';
import {
  exerciseDetailsOptions,
  useUpdateExerciseEntryMutation,
} from '@/hooks/Exercises/useExerciseEntries';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityDetailKeyValuePair, ExerciseEntry } from '@/types/exercises';
import { SortableSetItem } from '../Exercises/SortableWorkoutSet';
import { SetColumnHeaders } from '../Exercises/SetHeader';
import { CardioLog } from '../Exercises/CardioLog';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
interface EditExerciseEntryDialogProps {
  entry: ExerciseEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}
type SortableSet = WorkoutPresetSet & { _dndId: string };
const EditExerciseEntryDialog = ({
  entry,
  open,
  onOpenChange,
  onSave,
}: EditExerciseEntryDialogProps) => {
  const { t } = useTranslation();
  const { loggingLevel, weightUnit, distanceUnit, convertDistance } =
    usePreferences();

  const isCardio = entry.exercise_snapshot?.category === 'cardio';

  const [sets, setSets] = useState<SortableSet[]>(() =>
    ((entry.sets as WorkoutPresetSet[]) || []).map((set) => ({
      ...set,
      weight: Number(set.weight) || 0,
      _dndId: uuidv4(),
    }))
  );
  const [notes, setNotes] = useState(entry.notes || '');
  const [imageUrl, setImageUrl] = useState<string | null>(
    entry.image_url || null
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [caloriesBurnedInput, setCaloriesBurnedInput] = useState<number | ''>(
    entry.calories_burned || ''
  );
  const [distanceInput, setDistanceInput] = useState<number | ''>(
    entry.distance !== undefined && entry.distance !== null
      ? Number(convertDistance(entry.distance, 'km', distanceUnit).toFixed(1))
      : ''
  );
  const [avgHeartRateInput, setAvgHeartRateInput] = useState<number | ''>(
    entry.avg_heart_rate != null ? entry.avg_heart_rate : ''
  );
  const [durationInput, setDurationInput] = useState<number | ''>(
    entry.duration_minutes || ''
  );
  const [activityDetails, setActivityDetails] = useState<
    ActivityDetailKeyValuePair[]
  >(
    (entry.activity_details || []).map((detail) => ({
      id: detail.id,
      key: detail.detail_type,
      value:
        typeof detail.detail_data === 'string'
          ? detail.detail_data
          : JSON.stringify(detail.detail_data),
      provider_name: detail.provider_name,
      detail_type: detail.detail_type,
    }))
  );
  const [showCaloriesWarning, setShowCaloriesWarning] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { mutateAsync: updateExerciseEntry, isPending: loading } =
    useUpdateExerciseEntryMutation();
  const queryClient = useQueryClient();

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setImageFile(file);
      setImageUrl(URL.createObjectURL(file));
    }
  };
  const triggerCalorieWarning = () => {
    if (!entry.calories_burned) {
      setCaloriesBurnedInput('');
      setShowCaloriesWarning(true);
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImageUrl(null);
  };

  const handleSetChange = (
    setIndex: number,
    field: keyof WorkoutPresetSet,
    value: string | number | undefined
  ) => {
    setSets((prev) =>
      prev.map((set, i) => (i !== setIndex ? set : { ...set, [field]: value }))
    );
    triggerCalorieWarning();
  };

  const handleAddSet = () => {
    setSets((prev) => {
      const lastSet = prev[prev.length - 1] ?? {
        set_number: 0,
        set_type: 'Working Set' as const,
        reps: 10,
        weight: 0,
        _dndId: uuidv4(),
      };
      return [
        ...prev,
        {
          ...lastSet,
          set_number: prev.length + 1,
          _dndId: uuidv4(),
        },
      ];
    });
    triggerCalorieWarning();
  };

  const handleDuplicateSet = (setIndex: number) => {
    setSets((prev) => {
      const setToDuplicate = prev[setIndex];
      if (!setToDuplicate) return prev;
      return [
        ...prev.slice(0, setIndex + 1),
        { ...setToDuplicate, _dndId: uuidv4() },
        ...prev.slice(setIndex + 1),
      ].map((s, i) => ({ ...s, set_number: i + 1 }));
    });
    triggerCalorieWarning();
  };

  const handleRemoveSet = (setIndex: number) => {
    setSets((prev) =>
      prev
        .filter((_, i) => i !== setIndex)
        .map((s, i) => ({ ...s, set_number: i + 1 }))
    );
    triggerCalorieWarning();
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSets((items) => {
        const oldIndex = items.findIndex((s) => s._dndId === active.id);
        const newIndex = items.findIndex((s) => s._dndId === over.id);
        return arrayMove(items, oldIndex, newIndex).map((set, index) => ({
          ...set,
          set_number: index + 1,
        }));
      });
    }
  };

  const handleSave = async () => {
    info(loggingLevel, 'EditExerciseEntryDialog: saving entry:', entry.id);
    try {
      const exerciseData = await queryClient.fetchQuery(
        exerciseDetailsOptions(entry.exercise_id)
      );
      const caloriesPerHour = exerciseData?.calories_per_hour || 300;

      const totalDuration = isCardio
        ? durationInput === ''
          ? 0
          : Number(durationInput)
        : sets.reduce(
            (acc, set) => acc + (set.duration || 0) + (set.rest_time || 0) / 60,
            0
          );

      const caloriesBurned =
        caloriesBurnedInput !== '' && caloriesBurnedInput !== 0
          ? caloriesBurnedInput
          : Math.round((caloriesPerHour / 60) * totalDuration);

      await updateExerciseEntry({
        id: entry.id,
        data: {
          duration_minutes: totalDuration,
          calories_burned: caloriesBurned,
          notes,
          sets: sets.map(({ _dndId, ...set }) => ({
            ...set,
            weight: set.weight ?? 0,
          })),
          imageFile,
          image_url: imageUrl,
          distance:
            distanceInput === ''
              ? null
              : convertDistance(Number(distanceInput), distanceUnit, 'km'),
          avg_heart_rate:
            avgHeartRateInput === '' ? 0 : Number(avgHeartRateInput),
          activity_details: activityDetails.map((detail) => ({
            id: detail.id,
            provider_name: detail.provider_name,
            detail_type: detail.key,
            detail_data: detail.value,
          })),
        },
      });

      info(
        loggingLevel,
        'EditExerciseEntryDialog: saved successfully:',
        entry.id
      );
      onOpenChange(false);
      onSave();
    } catch (err) {
      error(loggingLevel, 'EditExerciseEntryDialog: error saving:', err);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        debug(loggingLevel, 'EditExerciseEntryDialog: open state changed:', o);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('exercise.editExerciseEntryDialog.title', 'Edit Exercise Entry')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'exercise.editExerciseEntryDialog.description',
              "Make changes to your exercise entry here. Click save when you're done."
            )}
          </DialogDescription>
        </DialogHeader>

        {showCaloriesWarning && (
          <Alert
            variant="default"
            className="bg-yellow-100 border-yellow-400 text-yellow-700 relative py-2"
          >
            <AlertDescription>
              {t(
                'exercise.editExerciseEntryDialog.caloriesWarning',
                'Calories burned will be recalculated on save. Enter a value to override.'
              )}
            </AlertDescription>
            <button
              onClick={() => setShowCaloriesWarning(false)}
              className="absolute top-1/2 right-2 -translate-y-1/2"
            >
              <X className="h-4 w-4" />
            </button>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          {/* Exercise name (read-only) */}
          <div className="space-y-1.5">
            <Label htmlFor="exercise-name" className="text-sm">
              {t('exercise.editExerciseEntryDialog.exerciseLabel', 'Exercise')}
            </Label>
            <Input
              id="exercise-name"
              value={
                entry.exercise_snapshot?.name ||
                t(
                  'exercise.editExerciseEntryDialog.unknownExercise',
                  'Unknown Exercise'
                )
              }
              disabled
              className="bg-muted"
            />
          </div>

          {/* ── Cardio log or strength sets ── */}
          {isCardio ? (
            <CardioLog
              durationMinutes={durationInput}
              distance={distanceInput}
              caloriesBurned={caloriesBurnedInput}
              avgHeartRate={avgHeartRateInput}
              rpe={sets[0]?.rpe ?? ''}
              distanceUnit={distanceUnit}
              onDurationChange={setDurationInput}
              onDistanceChange={setDistanceInput}
              onCaloriesChange={setCaloriesBurnedInput}
              onAvgHeartRateChange={setAvgHeartRateInput}
              onRpeChange={(v) =>
                setSets((prev) =>
                  prev.map((s, i) =>
                    i === 0 ? { ...s, rpe: v === '' ? null : Number(v) } : s
                  )
                )
              }
            />
          ) : (
            <div className="space-y-1">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SetColumnHeaders
                  category={entry.exercise_snapshot?.category}
                />
                <SortableContext items={sets.map((set) => set._dndId)}>
                  <div className="space-y-0.5">
                    {sets.map((set, setIndex) => (
                      <SortableSetItem
                        id={set._dndId}
                        key={set._dndId}
                        set={set}
                        setIndex={setIndex}
                        exerciseIndex={0}
                        onSetChange={(_, sIdx, field, value) =>
                          handleSetChange(sIdx, field, value ?? undefined)
                        }
                        onDuplicateSet={(_, sIdx) => handleDuplicateSet(sIdx)}
                        onRemoveSet={(_, sIdx) => handleRemoveSet(sIdx)}
                        weightUnit={weightUnit}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSet}
                className="mt-1"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {t('exercise.editExerciseEntryDialog.addSetButton', 'Add Set')}
              </Button>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm">
              {t('exercise.editExerciseEntryDialog.notesLabel', 'Notes')}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              rows={2}
              className="resize-none text-sm"
              placeholder={t(
                'exercise.editExerciseEntryDialog.notesPlaceholder',
                'Add any notes about this exercise...'
              )}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Exercise history */}
          <ExerciseHistoryDisplay exerciseId={entry.exercise_id} />

          {/* ── Advanced (collapsible) ── */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground px-2"
              >
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 transition-transform duration-200',
                    advancedOpen && 'rotate-180'
                  )}
                />
                <span className="text-xs font-medium uppercase tracking-wide">
                  {t('common.advanced', 'Advanced')}
                </span>
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-3 pt-2">
              {/* Calories override — strength only */}
              {!isCardio && (
                <div className="space-y-1.5">
                  <Label htmlFor="calories-burned" className="text-sm">
                    {t(
                      'exercise.editExerciseEntryDialog.caloriesBurnedOptionalLabel',
                      'Calories burned (optional)'
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="calories-burned"
                      type="number"
                      value={caloriesBurnedInput}
                      onChange={(e) =>
                        setCaloriesBurnedInput(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      placeholder={t(
                        'exercise.editExerciseEntryDialog.caloriesBurnedPlaceholder',
                        'Auto-calculated if left blank'
                      )}
                      className="pr-8"
                    />
                    {caloriesBurnedInput !== '' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setCaloriesBurnedInput('');
                          setShowCaloriesWarning(true);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Avg heart rate — strength only */}
              {!isCardio && (
                <div className="space-y-1.5">
                  <Label htmlFor="avg-heart-rate" className="text-sm">
                    {t(
                      'exercise.editExerciseEntryDialog.avgHeartRateLabel',
                      'Average heart rate (bpm)'
                    )}
                  </Label>
                  <Input
                    id="avg-heart-rate"
                    type="number"
                    value={avgHeartRateInput}
                    onChange={(e) =>
                      setAvgHeartRateInput(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    placeholder="0"
                  />
                </div>
              )}

              {/* Custom activity details */}
              <div className="space-y-1.5">
                <Label className="text-sm">
                  {t(
                    'exercise.editExerciseEntryDialog.customActivityDetailsLabel',
                    'Custom activity details'
                  )}
                </Label>
                <ExerciseActivityDetailsEditor
                  initialData={activityDetails}
                  onChange={setActivityDetails}
                />
              </div>

              {/* Image */}
              <div className="space-y-1.5">
                <Label htmlFor="image" className="text-sm">
                  {t('exercise.editExerciseEntryDialog.imageLabel', 'Photo')}
                </Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                {(imageUrl || imageFile) && (
                  <div className="mt-1 relative w-24 h-24">
                    <img
                      src={
                        imageFile
                          ? URL.createObjectURL(imageFile)
                          : imageUrl || ''
                      }
                      alt="Exercise"
                      className="h-full w-full object-cover rounded-md"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={handleClearImage}
                      className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex justify-end space-x-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading
              ? t('common.saving', 'Saving...')
              : t('common.saveChanges', 'Save Changes')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditExerciseEntryDialog;
