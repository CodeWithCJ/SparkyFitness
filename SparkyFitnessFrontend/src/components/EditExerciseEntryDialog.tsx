
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast"; // Import toast
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from '@/utils/logging';
import { fetchExerciseDetails } from '@/services/editExerciseEntryService';
import { updateExerciseEntry, ExerciseEntry } from '@/services/exerciseEntryService';
import { WorkoutPresetSet } from "@/types/workout";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Copy,
  X,
  Repeat,
  Dumbbell,
  Timer,
  Plus,
  XCircle,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ExerciseHistoryDisplay from "./ExerciseHistoryDisplay";


interface EditExerciseEntryDialogProps {
  entry: ExerciseEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}

const SortableSetItem = React.memo(
  ({
    set,
    setIndex,
    handleSetChange,
    handleDuplicateSet,
    handleRemoveSet,
    weightUnit,
  }: {
    set: WorkoutPresetSet;
    setIndex: number;
    handleSetChange: Function;
    handleDuplicateSet: Function;
    handleRemoveSet: Function;
    weightUnit: string;
  }) => {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: `set-${setIndex}` });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex flex-col space-y-1"
        {...attributes}
      >
        <div className="flex items-center space-x-2">
          <div {...listeners}>
            <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-8 gap-2 flex-grow items-center">
            <div className="md:col-span-1">
              <Label>Set</Label>
              <p className="font-medium p-2">{set.set_number}</p>
            </div>
            <div className="md:col-span-2">
              <Label>Type</Label>
              <Select
                value={set.set_type}
                onValueChange={(value) =>
                  handleSetChange(setIndex, "set_type", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Set Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Working Set">Working Set</SelectItem>
                  <SelectItem value="Warm-up">Warm-up</SelectItem>
                  <SelectItem value="Drop Set">Drop Set</SelectItem>
                  <SelectItem value="Failure">Failure</SelectItem>
                  <SelectItem value="AMRAP">AMRAP</SelectItem>
                  <SelectItem value="Back-off">Back-off</SelectItem>
                  <SelectItem value="Rest-Pause">Rest-Pause</SelectItem>
                  <SelectItem value="Cluster">Cluster</SelectItem>
                  <SelectItem value="Technique">Technique</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-1">
              <Label
                htmlFor={`reps-${setIndex}`}
                className="flex items-center"
              >
                <Repeat
                  className="h-4 w-4 mr-1"
                  style={{ color: "#3b82f6" }}
                />{" "}
                Reps
              </Label>
              <Input
                id={`reps-${setIndex}`}
                type="number"
                value={set.reps ?? ""}
                onChange={(e) =>
                  handleSetChange(setIndex, "reps", Number(e.target.value))
                }
              />
            </div>
            <div className="md:col-span-1">
              <Label
                htmlFor={`weight-${setIndex}`}
                className="flex items-center"
              >
                <Dumbbell
                  className="h-4 w-4 mr-1"
                  style={{ color: "#ef4444" }}
                />{" "}
                Weight ({weightUnit})
              </Label>
              <Input
                id={`weight-${setIndex}`}
                type="number"
                value={set.weight ?? ""}
                onChange={(e) =>
                  handleSetChange(setIndex, "weight", Number(e.target.value))
                }
              />
            </div>
            <div className="md:col-span-1">
              <Label
                htmlFor={`duration-${setIndex}`}
                className="flex items-center"
              >
                <Timer
                  className="h-4 w-4 mr-1"
                  style={{ color: "#f97316" }}
                />{" "}
                Duration (min)
              </Label>
              <Input
                id={`duration-${setIndex}`}
                type="number"
                value={set.duration ?? ""}
                onChange={(e) =>
                  handleSetChange(setIndex, "duration", Number(e.target.value))
                }
              />
            </div>
            <div className="md:col-span-1">
              <Label
                htmlFor={`rest-${setIndex}`}
                className="flex items-center"
              >
                <Timer
                  className="h-4 w-4 mr-1"
                  style={{ color: "#8b5cf6" }}
                />{" "}
                Rest (s)
              </Label>
              <Input
                id={`rest-${setIndex}`}
                type="number"
                value={set.rest_time ?? ""}
                onChange={(e) =>
                  handleSetChange(
                    setIndex,
                    "rest_time",
                    Number(e.target.value)
                  )
                }
              />
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDuplicateSet(setIndex)}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveSet(setIndex)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className="pl-8">
          <Label htmlFor={`notes-${setIndex}`}>Notes</Label>
          <Textarea
            id={`notes-${setIndex}`}
            value={set.notes ?? ""}
            onChange={(e) => handleSetChange(setIndex, "notes", e.target.value)}
            className="h-16"
          />
        </div>
      </div>
    );
  }
);

const EditExerciseEntryDialog = ({
  entry,
  open,
  onOpenChange,
  onSave,
}: EditExerciseEntryDialogProps) => {
  const { loggingLevel, weightUnit, convertWeight } = usePreferences();
  debug(
    loggingLevel,
    "EditExerciseEntryDialog: Component rendered for entry:",
    entry.id
  );

  const [sets, setSets] = useState<WorkoutPresetSet[]>(
    (entry.sets as WorkoutPresetSet[]) || []
  );
  const [notes, setNotes] = useState(entry.notes || "");
  const [imageUrl, setImageUrl] = useState<string | null>(entry.image_url || null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [caloriesBurnedInput, setCaloriesBurnedInput] = useState<number | ''>(entry.calories_burned || '');
  const [showCaloriesWarning, setShowCaloriesWarning] = useState(false);

  useEffect(() => {
    debug(
      loggingLevel,
      "EditExerciseEntryDialog: entry useEffect triggered.",
      entry
    );
    setSets(
      ((entry.sets as WorkoutPresetSet[]) || []).map(set => ({
        ...set,
        weight: Math.round(convertWeight(set.weight, 'kg', weightUnit))
      }))
    );
    setNotes(entry.notes || "");
    setImageUrl(entry.image_url || null);
    setImageFile(null);
    setCaloriesBurnedInput(entry.calories_burned || '');
  }, [entry, loggingLevel, weightUnit, convertWeight]);

  useEffect(() => {
    // When sets change, clear the calories burned input to trigger recalculation
    if (sets.length > 0) {
      setCaloriesBurnedInput('');
      setShowCaloriesWarning(true);
    }
  }, [sets]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setImageFile(file);
      setImageUrl(URL.createObjectURL(file)); // Show preview of new image
    }
  };

  const handleClearImage = () => {
    setImageFile(null);
    setImageUrl(null);
  };

  const handleSetChange = (
    setIndex: number,
    field: keyof WorkoutPresetSet,
    value: any
  ) => {
    debug(loggingLevel, `[EditExerciseEntryDialog] handleSetChange: index=${setIndex}, field=${field}, value=${value}, weightUnit=${weightUnit}`);
    setSets((prev) =>
      prev.map((set, sIndex) => {
        if (sIndex !== setIndex) {
          return set;
        }
        return { ...set, [field]: value };
      })
    );
  };

  const handleAddSet = () => {
    setSets((prev) => {
      const lastSet = prev.length > 0 ? prev[prev.length - 1] : { set_number: 0, set_type: 'Working Set' as const, reps: 10, weight: 0 };
      const newSet: WorkoutPresetSet = {
        ...lastSet,
        set_number: prev.length + 1,
      };
      return [...prev, newSet];
    });
  };

  const handleDuplicateSet = (setIndex: number) => {
    setSets((prev) => {
      const setToDuplicate = prev[setIndex];
      const newSets = [
        ...prev.slice(0, setIndex + 1),
        { ...setToDuplicate },
        ...prev.slice(setIndex + 1),
      ].map((s, i) => ({ ...s, set_number: i + 1 }));
      return newSets;
    });
  };

  const handleRemoveSet = (setIndex: number) => {
    setSets((prev) =>
      prev
        .filter((_, sIndex) => sIndex !== setIndex)
        .map((s, i) => ({ ...s, set_number: i + 1 }))
    );
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
      const oldIndex = sets.findIndex(
        (s, i) => `set-${i}` === active.id
      );
      const newIndex = sets.findIndex(
        (s, i) => `set-${i}` === over.id
      );
      setSets((items) => {
        const reorderedSets = arrayMove(items, oldIndex, newIndex);
        return reorderedSets.map((set, index) => ({
          ...set,
          set_number: index + 1,
        }));
      });
    }
  };

  const handleSave = async () => {
    info(
      loggingLevel,
      "EditExerciseEntryDialog: Attempting to save changes for entry:",
      entry.id
    );
    setLoading(true);

    try {
      debug(
        loggingLevel,
        "EditExerciseEntryDialog: Fetching exercise details for recalculation:",
        entry.exercise_id
      );
      const exerciseData = await fetchExerciseDetails(entry.exercise_id);

      const caloriesPerHour = exerciseData?.calories_per_hour || 300;
      const totalDurationFromSets = sets.reduce((acc, set) => acc + (set.duration || 0), 0);
      const totalDuration = totalDurationFromSets;

      let caloriesBurned;
      if (caloriesBurnedInput !== '' && caloriesBurnedInput !== 0) {
        caloriesBurned = caloriesBurnedInput;
      } else {
        caloriesBurned = (caloriesPerHour / 60) * totalDuration;
      }

      debug(
        loggingLevel,
        "EditExerciseEntryDialog: Final calories burned:",
        caloriesBurned
      );

      await updateExerciseEntry(entry.id, {
        duration_minutes: totalDuration,
        calories_burned: caloriesBurned,
        notes: notes,
        sets: sets.map(set => ({
          ...set,
          weight: convertWeight(set.weight, weightUnit, 'kg')
        })),
        imageFile: imageFile,
        image_url: imageUrl,
      });

      info(
        loggingLevel,
        "EditExerciseEntryDialog: Exercise entry updated successfully:",
        entry.id
      );
      toast({
        title: "Success",
        description: "Exercise entry updated successfully.",
      });
      onOpenChange(false);
      onSave();
    } catch (err) {
      error(
        loggingLevel,
        "EditExerciseEntryDialog: Error updating exercise entry:",
        err
      );
      toast({
        title: "Error",
        description: "Failed to update exercise entry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      debug(
        loggingLevel,
        "EditExerciseEntryDialog: Loading state set to false."
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        debug(
          loggingLevel,
          "EditExerciseEntryDialog: Dialog open state changed:",
          open
        );
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Exercise Entry</DialogTitle>
          <DialogDescription>
            Make changes to your exercise entry here. Click save when you're
            done.
          </DialogDescription>
        </DialogHeader>

        {showCaloriesWarning && (
          <Alert variant="default" className="bg-yellow-100 border-yellow-400 text-yellow-700 p-0.25 relative">
            <AlertDescription>
              Calories burned will be recalculated on save. Enter a value to override.
            </AlertDescription>
            <button onClick={() => setShowCaloriesWarning(false)} className="absolute top-1/2 right-2 -translate-y-1/2">
              <X className="h-4 w-4" />
            </button>
          </Alert>
        )}
        <div className="space-y-2">
          <div>
            <Label htmlFor="exercise-name">Exercise</Label>
            <Input
              id="exercise-name"
              value={entry.exercises?.name || "Unknown Exercise"}
              disabled
              className="bg-gray-100 dark:bg-gray-800"
            />
          </div>

          {sets && sets.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sets.map((_, i) => `set-${i}`)}
              >
                <div className="space-y-2">
                   {sets.map((set, setIndex) => (
                    <SortableSetItem
                      key={`set-${setIndex}`}
                      set={set}
                      setIndex={setIndex}
                      handleSetChange={handleSetChange}
                      handleDuplicateSet={handleDuplicateSet}
                      handleRemoveSet={handleRemoveSet}
                      weightUnit={weightUnit}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          <Button type="button" variant="outline" onClick={handleAddSet}>
            <Plus className="h-4 w-4 mr-2" /> Add Set
          </Button>
          <ExerciseHistoryDisplay exerciseId={entry.exercise_id} />

          <div>
            <Label htmlFor="calories-burned">Calories Burned (Optional)</Label>
            <Input
              id="calories-burned"
              type="number"
              value={caloriesBurnedInput}
              onChange={(e) => setCaloriesBurnedInput(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Enter calories burned to override calculation"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => {
                debug(
                  loggingLevel,
                  "EditExerciseEntryDialog: Notes input changed:",
                  e.target.value
                );
                setNotes(e.target.value);
              }}
              placeholder="Add any notes about this exercise..."
            />
          </div>

          <div>
            <Label htmlFor="image">Image</Label>
            <Input id="image" type="file" accept="image/*" onChange={handleImageUpload} />
            {(imageUrl || imageFile) && (
              <div className="mt-2 relative w-24 h-24">
                <img
                  src={imageFile ? URL.createObjectURL(imageFile) : imageUrl || ""}
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
        </div>

        <div className="flex justify-end space-x-2 mt-6">
          <Button
            variant="outline"
            onClick={() => {
              debug(
                loggingLevel,
                "EditExerciseEntryDialog: Cancel button clicked."
              );
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditExerciseEntryDialog;
