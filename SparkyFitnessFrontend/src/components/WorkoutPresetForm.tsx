import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { WorkoutPreset, WorkoutPresetExercise, WorkoutPresetSet } from "@/types/workout";
import { Exercise } from "@/services/exerciseService";
import AddExerciseDialog from "./AddExerciseDialog";
import ExerciseHistoryDisplay from "./ExerciseHistoryDisplay";
import { Plus, X, Repeat, Weight, Timer, ListOrdered, GripVertical, Copy, Dumbbell, Hourglass } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useToast } from "@/hooks/use-toast";
import { debug } from "@/utils/logging";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WorkoutPresetFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (preset: Omit<WorkoutPreset, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => void;
  initialPreset?: WorkoutPreset | null;
}

const SortableSetItem = React.memo(({ t, set, exerciseIndex, setIndex, onSetChange, onDuplicateSet, onRemoveSet, weightUnit }: { t: any, set: WorkoutPresetSet, exerciseIndex: number, setIndex: number, onSetChange: Function, onDuplicateSet: Function, onRemoveSet: Function, weightUnit: string }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: set.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col space-y-2" {...attributes}>
      <div className="flex items-center space-x-2">
        <div {...listeners}>
          <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-8 gap-2 flex-grow items-center">
          <div className="md:col-span-1">
            <Label>{t('workoutPresetForm.setLabel', 'Set')}</Label>
            <p className="font-medium p-2">{set.set_number}</p>
          </div>
          <div className="md:col-span-2">
            <Label>{t('workoutPresetForm.typeLabel', 'Type')}</Label>
            <Select value={set.set_type} onValueChange={(value) => onSetChange(exerciseIndex, setIndex, 'set_type', value)}>
              <SelectTrigger>
                <SelectValue placeholder={t('workoutPresetForm.setTypePlaceholder', 'Set Type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Working Set">{t('workoutPresetForm.workingSet', 'Working Set')}</SelectItem>
                <SelectItem value="Warm-up">{t('workoutPresetForm.warmUp', 'Warm-up')}</SelectItem>
                <SelectItem value="Drop Set">{t('workoutPresetForm.dropSet', 'Drop Set')}</SelectItem>
                <SelectItem value="Failure">{t('workoutPresetForm.failure', 'Failure')}</SelectItem>
                <SelectItem value="AMRAP">{t('workoutPresetForm.amrap', 'AMRAP')}</SelectItem>
                <SelectItem value="Back-off">{t('workoutPresetForm.backOff', 'Back-off')}</SelectItem>
                <SelectItem value="Rest-Pause">{t('workoutPresetForm.restPause', 'Rest-Pause')}</SelectItem>
                <SelectItem value="Cluster">{t('workoutPresetForm.cluster', 'Cluster')}</SelectItem>
                <SelectItem value="Technique">{t('workoutPresetForm.technique', 'Technique')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label htmlFor={`reps-${exerciseIndex}-${set.id}`} className="flex items-center">
              <Repeat className="h-4 w-4 mr-1" style={{ color: '#3b82f6' }} /> {t('workoutPresetForm.repsLabel', 'Reps')}
            </Label>
            <Input id={`reps-${exerciseIndex}-${set.id}`} type="number" value={set.reps ?? ''} onChange={(e) => onSetChange(exerciseIndex, setIndex, 'reps', Number(e.target.value))} />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor={`weight-${exerciseIndex}-${set.id}`} className="flex items-center">
              <Dumbbell className="h-4 w-4 mr-1" style={{ color: '#ef4444' }} /> {t('workoutPresetForm.weightLabel', 'Weight')} ({weightUnit})
            </Label>
            <Input id={`weight-${exerciseIndex}-${set.id}`} type="number" value={set.weight ?? ''} onChange={(e) => onSetChange(exerciseIndex, setIndex, 'weight', Number(e.target.value))} />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor={`duration-${exerciseIndex}-${set.id}`} className="flex items-center">
                            <Hourglass className="h-4 w-4 mr-1" style={{ color: '#f97316' }} /> {t('workoutPresetForm.durationLabel', 'Duration (min)')}
                          </Label>            <Input id={`duration-${exerciseIndex}-${set.id}`} type="number" value={set.duration ?? ''} onChange={(e) => onSetChange(exerciseIndex, setIndex, 'duration', Number(e.target.value))} />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor={`rest-${exerciseIndex}-${set.id}`} className="flex items-center">
              <Timer className="h-4 w-4 mr-1" style={{ color: '#8b5cf6' }} /> {t('workoutPresetForm.restLabel', 'Rest (s)')}
            </Label>
            <Input id={`rest-${exerciseIndex}-${set.id}`} type="number" value={set.rest_time ?? ''} onChange={(e) => onSetChange(exerciseIndex, setIndex, 'rest_time', Number(e.target.value))} />
          </div>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" onClick={() => onDuplicateSet(exerciseIndex, setIndex)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onRemoveSet(exerciseIndex, setIndex)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="pl-8">
        <Label htmlFor={`notes-${exerciseIndex}-${set.id}`}>{t('workoutPresetForm.notesLabel', 'Notes')}</Label>
        <Textarea id={`notes-${exerciseIndex}-${set.id}`} value={set.notes ?? ''} onChange={(e) => onSetChange(exerciseIndex, setIndex, 'notes', e.target.value)} />
      </div>
    </div>
  );
});

const WorkoutPresetForm: React.FC<WorkoutPresetFormProps> = ({
  isOpen,
  onClose,
  onSave,
  initialPreset,
}) => {
  const { t } = useTranslation();
  const { loggingLevel, weightUnit, convertWeight } = usePreferences();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [exercises, setExercises] = useState<WorkoutPresetExercise[]>([]);
  const [isAddExerciseDialogOpen, setIsAddExerciseDialogOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialPreset?.name || "");
      setDescription(initialPreset?.description || "");
      setIsPublic(initialPreset?.is_public || false);
      setExercises(
        initialPreset?.exercises.map(ex => ({
          ...ex,
          sets: ex.sets.map(set => ({
            ...set,
            weight: parseFloat(convertWeight(set.weight, 'kg', weightUnit).toFixed(2))
          }))
        })) || []
      );
    }
  }, [isOpen, initialPreset]);

  const handleAddExercise = (exercise: Exercise) => {
    const newExercise: WorkoutPresetExercise = {
      exercise_id: exercise.id,
      exercise_name: exercise.name,
      image_url: exercise.images && exercise.images.length > 0 ? exercise.images[0] : "",
      exercise: exercise,
      sets: [{ id: Date.now().toString(), set_number: 1, set_type: 'Working Set', reps: 10, weight: 0 }],
    };
    setExercises((prev) => [...prev, newExercise]);
    setIsAddExerciseDialogOpen(false);
  };

  const handleRemoveExercise = (index: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSetChange = useCallback((exerciseIndex: number, setIndex: number, field: keyof WorkoutPresetSet, value: any) => {
    setExercises(prev =>
      prev.map((exercise, eIndex) => {
        if (eIndex !== exerciseIndex) {
          return exercise;
        }
        return {
          ...exercise,
          sets: exercise.sets.map((set, sIndex) => {
            if (sIndex !== setIndex) {
              return set;
            }
            return { ...set, [field]: value };
          }),
        };
      })
    );
  }, []);

  const handleAddSet = useCallback((exerciseIndex: number) => {
    setExercises(prev =>
      prev.map((exercise, eIndex) => {
        if (eIndex !== exerciseIndex) {
          return exercise;
        }
        const lastSet = exercise.sets[exercise.sets.length - 1];
        const newSet: WorkoutPresetSet = {
          ...lastSet,
          id: Date.now().toString(),
          set_number: exercise.sets.length + 1,
        };
        return {
          ...exercise,
          sets: [...exercise.sets, newSet],
        };
      })
    );
  }, []);

  const handleDuplicateSet = useCallback((exerciseIndex: number, setIndex: number) => {
    setExercises(prev =>
      prev.map((exercise, eIndex) => {
        if (eIndex !== exerciseIndex) {
          return exercise;
        }
        const sets = exercise.sets;
        const setToDuplicate = sets[setIndex];
        const newSets = [
          ...sets.slice(0, setIndex + 1),
          { ...setToDuplicate, id: Date.now().toString() },
          ...sets.slice(setIndex + 1)
        ].map((s, i) => ({ ...s, set_number: i + 1 }));
        return { ...exercise, sets: newSets };
      })
    );
  }, []);

  const handleRemoveSet = useCallback((exerciseIndex: number, setIndex: number) => {
    setExercises(prev => {
      const newState = prev.map((exercise, eIndex) => {
        if (eIndex === exerciseIndex) {
          const newSets = exercise.sets
            .filter((_, sIndex) => sIndex !== setIndex)
            .map((s, i) => ({ ...s, set_number: i + 1 }));
          return { ...exercise, sets: newSets };
        }
        return exercise;
      });
      return newState.filter(exercise => exercise.sets.length > 0);
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
  
    setExercises((exercises) => {
      const newExercises = [...exercises];
      const activeExerciseIndex = newExercises.findIndex((ex) =>
        ex.sets.some((s) => s.id === active.id)
      );
      const overExerciseIndex = newExercises.findIndex((ex) =>
        ex.sets.some((s) => s.id === over.id)
      );
  
      if (activeExerciseIndex === -1 || overExerciseIndex === -1 || activeExerciseIndex !== overExerciseIndex) {
        return newExercises; // Only handle reordering within the same exercise
      }
  
      const exercise = newExercises[activeExerciseIndex];
      const oldIndex = exercise.sets.findIndex((s) => s.id === active.id);
      const newIndex = exercise.sets.findIndex((s) => s.id === over.id);
  
      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedSets = arrayMove(exercise.sets, oldIndex, newIndex);
        newExercises[activeExerciseIndex] = {
          ...exercise,
          sets: reorderedSets.map((set, index) => ({ ...set, set_number: index + 1 })),
        };
      }
  
      return newExercises;
    });
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        title: t('workoutPresetForm.validationErrorTitle', 'Validation Error'),
        description: t('workoutPresetForm.nameRequiredError', 'Preset Name is required.'),
        variant: "destructive",
      });
      return;
    }
    debug(loggingLevel, "WorkoutPresetForm: Submitting preset with data:", { name, description, isPublic, exercises });
    onSave({
      name,
      description,
      is_public: isPublic,
      exercises: exercises.map(ex => ({
        ...ex,
        sets: ex.sets.map(set => ({
          ...set,
          weight: convertWeight(set.weight, weightUnit, 'kg')
        }))
      }))
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialPreset ? t('workoutPresetForm.editTitle', 'Edit Workout Preset') : t('workoutPresetForm.createTitle', 'Create New Workout Preset')}</DialogTitle>
          <DialogDescription>
            {initialPreset ? t('workoutPresetForm.editDescription', 'Edit the details of your workout preset.') : t('workoutPresetForm.createDescription', 'Create a new workout preset by providing a name, description, and exercises.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 overflow-y-auto max-h-full">
          <div className="space-y-2">
            <Label htmlFor="name">{t('workoutPresetForm.nameLabel', 'Name')}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t('workoutPresetForm.descriptionLabel', 'Description')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="isPublic"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
            <Label htmlFor="isPublic">{t('workoutPresetForm.shareWithPublicLabel', 'Share with Public')}</Label>
          </div>

          <div className="col-span-4">
            <h3 className="text-lg font-semibold mb-2">{t('workoutPresetForm.exercisesLabel', 'Exercises')}</h3>
            <Button type="button" onClick={() => setIsAddExerciseDialogOpen(true)} className="mb-4">
              <Plus className="h-4 w-4 mr-2" /> {t('workoutPresetForm.addExerciseButton', 'Add Exercise')}
            </Button>

            <AddExerciseDialog
              open={isAddExerciseDialogOpen}
              onOpenChange={setIsAddExerciseDialogOpen}
              onExerciseAdded={handleAddExercise}
              mode="preset"
            />

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="space-y-2">
                {exercises.map((ex, exerciseIndex) => (
                  <div key={ex.exercise_id || `ex-${exerciseIndex}`} className="border p-4 rounded-md space-y-4">
                    <div className="flex justify-between items-center">
                      <h4 className="font-semibold">{ex.exercise_name}</h4>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveExercise(exerciseIndex)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <SortableContext items={ex.sets.map(s => s.id!)}>
                      <div className="space-y-2">
                        {ex.sets.map((set, setIndex) => (
                          <SortableSetItem
                            key={set.id}
                            t={t}
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
                    <Button type="button" variant="outline" onClick={() => handleAddSet(exerciseIndex)}>
                      <Plus className="h-4 w-4 mr-2" /> {t('workoutPresetForm.addSetButton', 'Add Set')}
                    </Button>
                    <ExerciseHistoryDisplay exerciseId={ex.exercise_id} />
                  </div>
                ))}
              </div>
            </DndContext>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit}>
            {initialPreset ? t('common.saveChanges', 'Save Changes') : t('workoutPresetForm.createPresetButton', 'Create Preset')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutPresetForm;
