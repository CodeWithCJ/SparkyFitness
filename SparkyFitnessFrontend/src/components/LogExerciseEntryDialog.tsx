import React, { useState, useEffect, ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from '@/utils/logging';
import { createExerciseEntry } from '@/services/exerciseEntryService';
import { useToast } from "@/hooks/use-toast";
import ExerciseHistoryDisplay from "./ExerciseHistoryDisplay";
import { WorkoutPresetSet } from "@/types/workout";
import { ExerciseToLog } from '@/components/ExerciseCard'; // Import ExerciseToLog
import { Plus, X, Copy, GripVertical, Repeat, Weight, Timer } from "lucide-react";
import ExerciseActivityDetailsEditor, { ActivityDetailKeyValuePair } from './ExerciseActivityDetailsEditor'; // New import
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { excerciseWorkoutSetTypes } from "@/constants/excerciseWorkoutSetTypes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LogExerciseEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: ExerciseToLog | null; // Change type to ExerciseToLog
  selectedDate: string;
  onSaveSuccess: () => void;
  initialSets?: WorkoutPresetSet[];
  initialNotes?: string;
  initialImageUrl?: string;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (value: number, fromUnit: 'kcal' | 'kJ', toUnit: 'kcal' | 'kJ') => number;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
}

const SortableSetItem = React.memo(({ set, index, handleSetChange, handleDuplicateSet, handleRemoveSet, weightUnit, t }: { set: WorkoutPresetSet, index: number, handleSetChange: Function, handleDuplicateSet: Function, handleRemoveSet: Function, weightUnit: string, t: Function }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `set-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center space-x-2" {...attributes}>
      <div {...listeners}>
        <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-8 gap-2 flex-grow">
        <div className="md:col-span-1"><Label>{t("exercise.logExerciseEntryDialog.setLabel", "Set")}</Label><p className="font-medium p-2">{set.set_number}</p></div>
        <div className="md:col-span-2"><Label>{t("exercise.logExerciseEntryDialog.typeLabel", "Type")}</Label>
          <Select value={set.set_type} onValueChange={(value) => handleSetChange(index, 'set_type', value)}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {excerciseWorkoutSetTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-1"><Label className="flex items-center"><Repeat className="h-4 w-4 mr-1" style={{ color: '#3b82f6' }} />{t("exercise.logExerciseEntryDialog.repsLabel", "Reps")}</Label><Input type="number" value={set.reps ?? ''} onChange={(e) => handleSetChange(index, 'reps', Number(e.target.value))} /></div>
        <div className="md:col-span-1"><Label className="flex items-center"><Weight className="h-4 w-4 mr-1" style={{ color: '#ef4444' }} />{t("exercise.logExerciseEntryDialog.weightLabel", "Weight")} ({weightUnit})</Label><Input type="number" value={set.weight ?? ''} onChange={(e) => handleSetChange(index, 'weight', Number(e.target.value))} /></div>
        <div className="md:col-span-1"><Label className="flex items-center"><Timer className="h-4 w-4 mr-1" style={{ color: '#f97316' }} />{t("exercise.logExerciseEntryDialog.durationLabel", "Duration")}</Label><Input type="number" value={set.duration ?? ''} onChange={(e) => handleSetChange(index, 'duration', Number(e.target.value))} /></div>
        <div className="md:col-span-1"><Label className="flex items-center"><Timer className="h-4 w-4 mr-1" style={{ color: '#8b5cf6' }} />{t("exercise.logExerciseEntryDialog.restLabel", "Rest (s)")}</Label><Input type="number" value={set.rest_time ?? ''} onChange={(e) => handleSetChange(index, 'rest_time', Number(e.target.value))} /></div>
        <div className="col-span-1 md:col-span-8"><Label>{t("exercise.logExerciseEntryDialog.notesLabel", "Notes")}</Label><Textarea value={set.notes ?? ''} onChange={(e) => handleSetChange(index, 'notes', e.target.value)} /></div>
      </div>
      <div className="flex flex-col space-y-1">
        <Button variant="ghost" size="icon" onClick={() => handleDuplicateSet(index)}><Copy className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => handleRemoveSet(index)}><X className="h-4 w-4" /></Button>
      </div>
    </div>
  );
});

const LogExerciseEntryDialog: React.FC<LogExerciseEntryDialogProps> = ({
  isOpen,
  onClose,
  exercise,
  selectedDate,
  onSaveSuccess,
  initialSets,
  initialNotes,
  initialImageUrl,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
}) => {
  const { t } = useTranslation();
  const { loggingLevel, weightUnit, distanceUnit, convertWeight, convertDistance } = usePreferences();
  const { toast } = useToast();

  const [sets, setSets] = useState<WorkoutPresetSet[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [caloriesBurnedInput, setCaloriesBurnedInput] = useState<number | ''>(''); // New state for user-provided calories
  const [distanceInput, setDistanceInput] = useState<number | ''>('');
  const [avgHeartRateInput, setAvgHeartRateInput] = useState<number | ''>('');
  const [activityDetails, setActivityDetails] = useState<ActivityDetailKeyValuePair[]>([]); // New state for activity details

  useEffect(() => {
    if (isOpen && exercise) {
      setSets(initialSets && initialSets.length > 0 ? initialSets : [{ set_number: 1, set_type: 'Working Set', reps: 10, weight: 0 }]);
      setNotes(initialNotes ?? '');
      setImageUrl(initialImageUrl ?? '');
      setImageFile(null);
      // If the exercise has a calories_per_hour, pre-fill the caloriesBurnedInput
      if (exercise?.calories_per_hour && exercise.duration) {
        // Assume exercise.calories_per_hour and exercise.duration are in units that result in kcal
        setCaloriesBurnedInput(Math.round((exercise.calories_per_hour / 60) * exercise.duration)); // This value is in kcal
      } else {
        setCaloriesBurnedInput('');
      }
      setDistanceInput(exercise?.distance ? Number(convertDistance(exercise.distance, 'km', distanceUnit).toFixed(1)) : '');
      setAvgHeartRateInput(exercise?.avg_heart_rate || '');
      debug(loggingLevel, `LogExerciseEntryDialog: Opened for exercise ${exercise.name} on ${selectedDate}`);
    }
  }, [isOpen, exercise, selectedDate, loggingLevel, initialSets, initialNotes, initialImageUrl, distanceUnit, convertDistance]);

  const handleSetChange = (index: number, field: keyof WorkoutPresetSet, value: any) => {
    debug(loggingLevel, `[LogExerciseEntryDialog] handleSetChange: index=${index}, field=${field}, value=${value}, weightUnit=${weightUnit}`);
    setSets(prev => {
      const newSets = [...prev];
      newSets[index] = { ...newSets[index], [field]: value };
      return newSets;
    });
  };

  const handleAddSet = () => {
    setSets(prev => {
      const lastSet = prev[prev.length - 1];
      const newSet: WorkoutPresetSet = {
        ...lastSet,
        set_number: prev.length + 1,
      };
      return [...prev, newSet];
    });
  };

  const handleDuplicateSet = (index: number) => {
    setSets(prev => {
      const setToDuplicate = prev[index];
      const newSets = [
        ...prev.slice(0, index + 1),
        { ...setToDuplicate },
        ...prev.slice(index + 1)
      ].map((s, i) => ({ ...s, set_number: i + 1 }));
      return newSets;
    });
  };

  const handleRemoveSet = (index: number) => {
    setSets(prev => {
      if (prev.length === 1) return prev; // Prevent removing the last set
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

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSets((items) => {
        const oldIndex = items.findIndex((item, index) => `set-${index}` === active.id);
        const newIndex = items.findIndex((item, index) => `set-${index}` === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        return newItems.map((item, index) => ({ ...item, set_number: index + 1 }));
      });
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setImageFile(file);
    } else {
      setImageFile(null);
    }
  };

  const handleSave = async () => {
    if (!exercise) {
      warn(loggingLevel, t("exercise.logExerciseEntryDialog.noExerciseSelected", "LogExerciseEntryDialog: Attempted to save without a selected exercise."));
      return;
    }

    setLoading(true);
    try {
      let finalCaloriesBurned = null;
      if (caloriesBurnedInput !== '') {
        // Convert user-provided calories back to kcal if the display unit is kJ
        finalCaloriesBurned = convertEnergy(Number(caloriesBurnedInput), energyUnit, 'kcal');
      }

      const entryData = {
        exercise_id: exercise.id,
        sets: sets.map(set => ({
          ...set,
          weight: convertWeight(set.weight, weightUnit, 'kg') // Corrected to save as kg
        })),
        notes: notes,
        entry_date: selectedDate,
        calories_burned: finalCaloriesBurned, // Use the potentially converted value
        duration_minutes: sets.reduce((acc, set) => acc + (set.duration || 0), 0),
        imageFile: imageFile,
        distance: distanceInput === '' ? null : convertDistance(Number(distanceInput), distanceUnit, 'km'),
        avg_heart_rate: avgHeartRateInput === '' ? null : Number(avgHeartRateInput),
        activity_details: activityDetails.map(detail => ({
          provider_name: detail.provider_name,
          detail_type: detail.detail_type,
          detail_data: detail.value, // Send the raw value, backend will handle JSONB storage
        })),
      };

      await createExerciseEntry(entryData);
      info(loggingLevel, `LogExerciseEntryDialog: Exercise entry saved successfully for ${exercise.name}`);
      toast({
        title: t("exercise.logExerciseEntryDialog.successTitle", "Success"),
        description: t("exercise.logExerciseEntryDialog.successDescription", "Exercise \"{{exerciseName}}\" logged successfully.", { exerciseName: exercise.name }),
        variant: "default",
      });
      onSaveSuccess();
      onClose();
    } catch (err) {
      error(loggingLevel, "LogExerciseEntryDialog: Error saving exercise entry:", err);
      toast({
        title: t("exercise.logExerciseEntryDialog.errorTitle", "Error"),
        description: t("exercise.logExerciseEntryDialog.errorDescription", "Failed to log exercise: {{errorMessage}}", { errorMessage: err instanceof Error ? err.message : String(err) }),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("exercise.logExerciseEntryDialog.logExercise", "Log Exercise: {{exerciseName}}", { exerciseName: exercise?.name })}</DialogTitle>
          <DialogDescription>
            {t("exercise.logExerciseEntryDialog.enterDetails", "Enter details for your exercise session on {{selectedDate}}.", { selectedDate })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sets.map((_, index) => `set-${index}`)}>
              <div className="space-y-2">
                {sets.map((set, index) => (
                  <SortableSetItem key={`set-${index}`} set={set} index={index} handleSetChange={handleSetChange} handleDuplicateSet={handleDuplicateSet} handleRemoveSet={handleRemoveSet} weightUnit={weightUnit} t={t} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <Button type="button" variant="outline" onClick={handleAddSet}>
            <Plus className="h-4 w-4 mr-2" /> {t("exercise.logExerciseEntryDialog.addSet", "Add Set")}
          </Button>
          <div className="space-y-2">
            <Label htmlFor="calories-burned">{t("exercise.logExerciseEntryDialog.caloriesBurnedOptional", `Calories Burned (Optional, ${getEnergyUnitString(energyUnit)})`)}</Label>
            <Input
              id="calories-burned"
              type="number"
              value={caloriesBurnedInput === '' ? '' : Math.round(convertEnergy(Number(caloriesBurnedInput), 'kcal', energyUnit))}
              onChange={(e) => setCaloriesBurnedInput(e.target.value === '' ? '' : Math.round(convertEnergy(Number(e.target.value), energyUnit, 'kcal')))}
              placeholder={t("exercise.logExerciseEntryDialog.enterCaloriesBurned", "Enter calories burned")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="distance">{t("exercise.logExerciseEntryDialog.distanceLabel", "Distance ({{distanceUnit}})", { distanceUnit })}</Label>
            <Input
              id="distance"
              type="number"
              value={distanceInput}
              onChange={(e) => setDistanceInput(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={t("exercise.logExerciseEntryDialog.enterDistance", "Enter distance in {{distanceUnit}}", { distanceUnit })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avg-heart-rate">{t("exercise.logExerciseEntryDialog.avgHeartRateLabel", "Average Heart Rate (bpm)")}</Label>
            <Input
              id="avg-heart-rate"
              type="number"
              value={avgHeartRateInput}
              onChange={(e) => setAvgHeartRateInput(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={t("exercise.logExerciseEntryDialog.enterAvgHeartRate", "Enter average heart rate")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("exercise.logExerciseEntryDialog.customActivityDetails", "Custom Activity Details")}</Label>
            <ExerciseActivityDetailsEditor
              initialData={activityDetails}
              onChange={setActivityDetails}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">{t("exercise.logExerciseEntryDialog.sessionNotes", "Session Notes")}</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="image">{t("exercise.logExerciseEntryDialog.uploadImage", "Upload Image")}</Label>
            <Input id="image" type="file" accept="image/*" onChange={handleImageUpload} />
            {imageFile && (
              <div className="mt-2">
                <img src={URL.createObjectURL(imageFile)} alt={t("exercise.logExerciseEntryDialog.imagePreviewAlt", "Preview")} className="h-24 w-24 object-cover rounded-md" />
              </div>
            )}
          </div>
        </div>
        {exercise && <ExerciseHistoryDisplay exerciseId={exercise.id} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("exercise.logExerciseEntryDialog.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={loading || !exercise}>
            {loading ? t("exercise.logExerciseEntryDialog.saving", "Saving...") : t("exercise.logExerciseEntryDialog.saveEntry", "Save Entry")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogExerciseEntryDialog;