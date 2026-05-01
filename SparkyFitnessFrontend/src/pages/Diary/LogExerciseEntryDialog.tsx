import React, { useState, useEffect, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { error } from '@/utils/logging';
import ExerciseHistoryDisplay from '@/components/ExerciseHistoryDisplay';
import type { ExerciseToLog, WorkoutPresetSet } from '@/types/workout';
import { Plus, ChevronDown, XCircle } from 'lucide-react';
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
import { useCreateExerciseEntryMutation } from '@/hooks/Exercises/useExerciseEntries';
import { ActivityDetailKeyValuePair } from '@/types/exercises';
import { SortableSetItem } from '../Exercises/SortableWorkoutSet';
import { SetColumnHeaders } from '../Exercises/SetHeader';
import { cn } from '@/lib/utils';
import { CardioLog } from '../Exercises/CardioLog';
import { v4 as uuidv4 } from 'uuid';

interface LogExerciseEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: ExerciseToLog | null;
  selectedDate: string;
  onSaveSuccess: () => void;
  initialSets?: WorkoutPresetSet[];
  initialNotes?: string;
  initialImageUrl?: string;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
}

type SortableSet = WorkoutPresetSet & { _dndId: string };

const LogExerciseEntryDialog: React.FC<LogExerciseEntryDialogProps> = ({
  isOpen,
  onClose,
  exercise,
  selectedDate,
  onSaveSuccess,
  initialSets,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
}) => {
  const { t } = useTranslation();
  const { loggingLevel, weightUnit, distanceUnit, convertDistance } =
    usePreferences();

  const isCardio = exercise?.category === 'cardio';

  const [notes, setNotes] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [distanceInput, setDistanceInput] = useState<number | ''>('');
  const [avgHeartRateInput, setAvgHeartRateInput] = useState<number | ''>('');
  const [durationInput, setDurationInput] = useState<number | ''>('');
  const [caloriesBurnedInput, setCaloriesBurnedInput] = useState<number | ''>(
    () => {
      if (exercise?.calories_per_hour && exercise.duration) {
        return Math.round(
          (exercise.calories_per_hour / 60) * exercise.duration
        );
      }
      return '';
    }
  );
  const [activityDetails, setActivityDetails] = useState<
    ActivityDetailKeyValuePair[]
  >([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { mutateAsync: createExerciseEntry, isPending: loading } =
    useCreateExerciseEntryMutation();

  const [sets, setSets] = useState<SortableSet[]>(() => {
    if (initialSets && initialSets.length > 0) {
      return initialSets.map((set) => ({
        ...set,
        weight: Number(set.weight) || 0,
        _dndId: uuidv4(),
      }));
    }
    return [
      {
        set_number: 1,
        set_type: 'Working Set',
        reps: 10,
        weight: 0,
        _dndId: uuidv4(),
      },
    ];
  });

  const handleSetChange = (
    index: number,
    field: keyof WorkoutPresetSet,
    value: string | number | undefined
  ) => {
    setSets((prev) => {
      const currentSet = prev[index];
      if (!currentSet) return prev;
      const newSets = [...prev];
      newSets[index] = { ...currentSet, [field]: value };
      return newSets;
    });
  };

  const handleAddSet = () => {
    setSets((prev) => {
      const lastSet = prev[prev.length - 1];
      if (!lastSet) return prev;
      return [
        ...prev,
        {
          ...lastSet,
          set_number: prev.length + 1,
          _dndId: uuidv4(),
        },
      ];
    });
  };

  const handleDuplicateSet = (index: number) => {
    setSets((prev) => {
      const setToDuplicate = prev[index];
      if (!setToDuplicate) return prev;
      return [
        ...prev.slice(0, index + 1),
        { ...setToDuplicate, _dndId: uuidv4() },
        ...prev.slice(index + 1),
      ].map((s, i) => ({ ...s, set_number: i + 1 }));
    });
  };

  const handleRemoveSet = (index: number) => {
    setSets((prev) => {
      if (prev.length === 1) return prev;
      return prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, set_number: i + 1 }));
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSets((items) => {
        const oldIndex = items.findIndex((item) => item._dndId === active.id);
        const newIndex = items.findIndex((item) => item._dndId === over.id);
        return arrayMove(items, oldIndex, newIndex).map((item, index) => ({
          ...item,
          set_number: index + 1,
        }));
      });
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setImageFile(null);
      setPreviewUrl(null);
    }
  };

  const handleClearImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageFile(null);
    setPreviewUrl(null);
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleSave = async () => {
    if (!exercise) return;

    try {
      const mappedDetails = activityDetails
        .map((detail) => ({
          provider_name: detail.provider_name,
          detail_type: detail.detail_type || '',
          detail_data: detail.value,
        }))
        .filter((detail) => detail.detail_type !== '');

      const totalDuration = isCardio
        ? durationInput === ''
          ? 0
          : durationInput
        : sets.reduce(
            (acc, set) => acc + (set.duration || 0) + (set.rest_time || 0) / 60,
            0
          );

      const entryData = {
        exercise_id: exercise.id,
        sets: sets.map(({ _dndId, ...set }) => ({
          ...set,
          weight: set.weight ?? 0,
        })),
        notes,
        entry_date: selectedDate,
        calories_burned: Number(caloriesBurnedInput),
        duration_minutes: totalDuration,
        imageFile,
        distance:
          distanceInput === ''
            ? null
            : convertDistance(Number(distanceInput), distanceUnit, 'km'),
        avg_heart_rate:
          avgHeartRateInput === '' ? null : Number(avgHeartRateInput),
        ...(mappedDetails.length > 0 && { activity_details: mappedDetails }),
      };

      await createExerciseEntry(entryData);
      onSaveSuccess();
      onClose();
    } catch (err) {
      error(
        loggingLevel,
        'LogExerciseEntryDialog: Error saving exercise entry:',
        err
      );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(
              'exercise.logExerciseEntryDialog.logExercise',
              'Log Exercise: {{exerciseName}}',
              { exerciseName: exercise?.name }
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'exercise.logExerciseEntryDialog.enterDetails',
              'Enter details for your exercise session on {{selectedDate}}.',
              { selectedDate }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
                <SetColumnHeaders category={exercise?.category} />
                <SortableContext items={sets.map((set) => set._dndId)}>
                  <div className="space-y-0.5">
                    {sets.map((set, index) => (
                      <SortableSetItem
                        key={set._dndId}
                        id={set._dndId}
                        set={set}
                        setIndex={index}
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
                {t('exercise.logExerciseEntryDialog.addSet', 'Add Set')}
              </Button>
            </div>
          )}

          {/* ── Notes ── */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm">
              {t('exercise.logExerciseEntryDialog.sessionNotes', 'Notes')}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              rows={2}
              className="resize-none text-sm"
              placeholder={t(
                'exercise.logExerciseEntryDialog.notesPlaceholder',
                'Any notes about this session...'
              )}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* ── Exercise history ── */}
          {exercise && <ExerciseHistoryDisplay exerciseId={exercise.id} />}

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
              {/* Calories — only for strength (cardio shows it in CardioLog) */}
              {!isCardio && (
                <div className="space-y-1.5">
                  <Label htmlFor="calories-burned" className="text-sm">
                    {t(
                      'exercise.logExerciseEntryDialog.caloriesBurnedOptional',
                      `Calories burned (${getEnergyUnitString(energyUnit)}, optional)`
                    )}
                  </Label>
                  <Input
                    id="calories-burned"
                    type="number"
                    value={
                      caloriesBurnedInput === ''
                        ? ''
                        : Math.round(
                            convertEnergy(
                              Number(caloriesBurnedInput),
                              'kcal',
                              energyUnit
                            )
                          )
                    }
                    onChange={(e) =>
                      setCaloriesBurnedInput(
                        e.target.value === ''
                          ? ''
                          : Math.round(
                              convertEnergy(
                                Number(e.target.value),
                                energyUnit,
                                'kcal'
                              )
                            )
                      )
                    }
                    placeholder={t(
                      'exercise.logExerciseEntryDialog.caloriesAutoHint',
                      'Auto-calculated if left blank'
                    )}
                  />
                </div>
              )}

              {/* Avg heart rate — only for strength (cardio shows it in CardioLog) */}
              {!isCardio && (
                <div className="space-y-1.5">
                  <Label htmlFor="avg-heart-rate" className="text-sm">
                    {t(
                      'exercise.logExerciseEntryDialog.avgHeartRateLabel',
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
                    'exercise.logExerciseEntryDialog.customActivityDetails',
                    'Custom activity details'
                  )}
                </Label>
                <ExerciseActivityDetailsEditor
                  initialData={activityDetails}
                  onChange={setActivityDetails}
                />
              </div>

              {/* Image upload */}
              <div className="space-y-1.5">
                <Label htmlFor="image" className="text-sm">
                  {t('exercise.logExerciseEntryDialog.uploadImage', 'Photo')}
                </Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                />
                {previewUrl && (
                  <div className="relative w-24 h-24 mt-1">
                    <img
                      src={previewUrl}
                      alt={t(
                        'exercise.logExerciseEntryDialog.imagePreviewAlt',
                        'Preview'
                      )}
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t('exercise.logExerciseEntryDialog.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={loading || !exercise}>
            {loading
              ? t('exercise.logExerciseEntryDialog.saving', 'Saving...')
              : t('exercise.logExerciseEntryDialog.saveEntry', 'Save Entry')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogExerciseEntryDialog;
