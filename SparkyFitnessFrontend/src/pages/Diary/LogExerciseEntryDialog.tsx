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
import { usePreferences } from '@/contexts/PreferencesContext';
import { error } from '@/utils/logging';
import ExerciseHistoryDisplay from '../../components/ExerciseHistoryDisplay';
import type { ExerciseToLog, WorkoutPresetSet } from '@/types/workout';
import { Plus } from 'lucide-react';
import ExerciseActivityDetailsEditor, {
  type ActivityDetailKeyValuePair,
} from '../../components/ExerciseActivityDetailsEditor';
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
import { SortableSetItem } from './ExerciseSortableItems';

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
  const {
    loggingLevel,
    weightUnit,
    distanceUnit,
    convertWeight,
    convertDistance,
  } = usePreferences();

  const [notes, setNotes] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [distanceInput, setDistanceInput] = useState<number | ''>('');
  const [avgHeartRateInput, setAvgHeartRateInput] = useState<number | ''>('');
  const [activityDetails, setActivityDetails] = useState<
    ActivityDetailKeyValuePair[]
  >([]);

  const { mutateAsync: createExerciseEntry, isPending: loading } =
    useCreateExerciseEntryMutation();

  const [sets, setSets] = useState<WorkoutPresetSet[]>(() =>
    initialSets && initialSets.length > 0
      ? initialSets
      : [{ set_number: 1, set_type: 'Working Set', reps: 10, weight: 0 }]
  );

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

  const handleSetChange = (
    index: number,
    field: keyof WorkoutPresetSet,
    value: string | number | undefined
  ) => {
    setSets((prev) => {
      const newSets = [...prev];
      newSets[index] = { ...newSets[index], [field]: value };
      return newSets;
    });
  };

  const handleAddSet = () => {
    setSets((prev) => {
      const lastSet = prev[prev.length - 1];
      const newSet: WorkoutPresetSet = {
        ...lastSet,
        set_number: prev.length + 1,
      };
      return [...prev, newSet];
    });
  };

  const handleDuplicateSet = (index: number) => {
    setSets((prev) => {
      const setToDuplicate = prev[index];
      const newSets = [
        ...prev.slice(0, index + 1),
        { ...setToDuplicate },
        ...prev.slice(index + 1),
      ].map((s, i) => ({ ...s, set_number: i + 1 }));
      return newSets;
    });
  };

  const handleRemoveSet = (index: number) => {
    setSets((prev) => {
      if (prev.length === 1) return prev;
      let newSets = prev.filter((_, i) => i !== index);
      newSets = newSets.map((s, i) => ({ ...s, set_number: i + 1 }));
      return newSets;
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
        const oldIndex = items.findIndex(
          (_item, index) => `set-${index}` === active.id
        );
        const newIndex = items.findIndex(
          (_item, index) => `set-${index}` === over.id
        );
        const newItems = arrayMove(items, oldIndex, newIndex);
        return newItems.map((item, index) => ({
          ...item,
          set_number: index + 1,
        }));
      });
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setImageFile(null);
      setPreviewUrl(null);
    }
  };

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleSave = async () => {
    if (!exercise) {
      return;
    }

    try {
      let finalCaloriesBurned = null;
      if (caloriesBurnedInput !== '') {
        finalCaloriesBurned = convertEnergy(
          Number(caloriesBurnedInput),
          energyUnit,
          'kcal'
        );
      }

      const mappedDetails = activityDetails
        .map((detail) => ({
          provider_name: detail.provider_name,
          detail_type: detail.detail_type || '',
          detail_data: detail.value,
        }))
        .filter((detail) => detail.detail_type !== '');

      const entryData = {
        exercise_id: exercise.id,
        sets: sets.map((set) => ({
          ...set,
          weight: convertWeight(set.weight ?? 0, weightUnit, 'kg'),
        })),
        notes: notes,
        entry_date: selectedDate,
        calories_burned: finalCaloriesBurned,
        duration_minutes: sets.reduce(
          (acc, set) => acc + (set.duration || 0),
          0
        ),
        imageFile: imageFile,
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
        <div className="space-y-4 py-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sets.map((_, index) => `set-${index}`)}>
              <div className="space-y-2">
                {sets.map((set, index) => (
                  <SortableSetItem
                    key={`set-${index}`}
                    set={set}
                    setIndex={index}
                    handleSetChange={handleSetChange}
                    handleDuplicateSet={handleDuplicateSet}
                    handleRemoveSet={handleRemoveSet}
                    weightUnit={weightUnit}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <Button type="button" variant="outline" onClick={handleAddSet}>
            <Plus className="h-4 w-4 mr-2" />{' '}
            {t('exercise.logExerciseEntryDialog.addSet', 'Add Set')}
          </Button>
          <div className="space-y-2">
            <Label htmlFor="calories-burned">
              {t(
                'exercise.logExerciseEntryDialog.caloriesBurnedOptional',
                `Calories Burned (Optional, ${getEnergyUnitString(energyUnit)})`
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
                'exercise.logExerciseEntryDialog.enterCaloriesBurned',
                'Enter calories burned'
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="distance">
              {t(
                'exercise.logExerciseEntryDialog.distanceLabel',
                'Distance ({{distanceUnit}})',
                { distanceUnit }
              )}
            </Label>
            <Input
              id="distance"
              type="number"
              value={distanceInput}
              onChange={(e) =>
                setDistanceInput(
                  e.target.value === '' ? '' : Number(e.target.value)
                )
              }
              placeholder={t(
                'exercise.logExerciseEntryDialog.enterDistance',
                'Enter distance in {{distanceUnit}}',
                { distanceUnit }
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avg-heart-rate">
              {t(
                'exercise.logExerciseEntryDialog.avgHeartRateLabel',
                'Average Heart Rate (bpm)'
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
              placeholder={t(
                'exercise.logExerciseEntryDialog.enterAvgHeartRate',
                'Enter average heart rate'
              )}
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t(
                'exercise.logExerciseEntryDialog.customActivityDetails',
                'Custom Activity Details'
              )}
            </Label>
            <ExerciseActivityDetailsEditor
              initialData={activityDetails}
              onChange={setActivityDetails}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">
              {t(
                'exercise.logExerciseEntryDialog.sessionNotes',
                'Session Notes'
              )}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="image">
              {t('exercise.logExerciseEntryDialog.uploadImage', 'Upload Image')}
            </Label>
            <Input
              id="image"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
            />
            {previewUrl && (
              <div className="mt-2">
                <img
                  src={previewUrl}
                  alt={t(
                    'exercise.logExerciseEntryDialog.imagePreviewAlt',
                    'Preview'
                  )}
                  className="h-24 w-24 object-cover rounded-md"
                />
              </div>
            )}
          </div>
        </div>
        {exercise && <ExerciseHistoryDisplay exerciseId={exercise.id} />}
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
