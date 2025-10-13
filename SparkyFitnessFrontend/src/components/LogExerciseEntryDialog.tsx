import React, { useState, useEffect, ChangeEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from '@/utils/logging';
import { Exercise } from '@/services/exerciseSearchService';
import { createExerciseEntry } from '@/services/exerciseEntryService';
import { useToast } from "@/hooks/use-toast";
import ExerciseHistoryDisplay from "./ExerciseHistoryDisplay";
import { WorkoutPresetSet } from "@/types/workout";
import { Plus, X, Copy, GripVertical, Repeat, Weight, Timer } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LogExerciseEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exercise: Exercise | null;
  selectedDate: string;
  onSaveSuccess: () => void;
  initialSets?: WorkoutPresetSet[];
  initialNotes?: string;
  initialImageUrl?: string;
}

const LogExerciseEntryDialog: React.FC<LogExerciseEntryDialogProps> = ({
  isOpen,
  onClose,
  exercise,
  selectedDate,
  onSaveSuccess,
  initialSets,
  initialNotes,
  initialImageUrl,
}) => {
  const { loggingLevel } = usePreferences();
  const { toast } = useToast();

  const [sets, setSets] = useState<WorkoutPresetSet[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && exercise) {
      setSets(initialSets && initialSets.length > 0 ? initialSets : [{ set_number: 1, set_type: 'Working Set', reps: 10, weight: 0 }]);
      setNotes(initialNotes ?? '');
      setImageUrl(initialImageUrl ?? '');
      setImageFile(null);
      debug(loggingLevel, `LogExerciseEntryDialog: Opened for exercise ${exercise.name} on ${selectedDate}`);
    }
  }, [isOpen, exercise, selectedDate, loggingLevel, initialSets, initialNotes, initialImageUrl]);

  const handleSetChange = (index: number, field: keyof WorkoutPresetSet, value: any) => {
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
      warn(loggingLevel, "LogExerciseEntryDialog: Attempted to save without a selected exercise.");
      return;
    }

    setLoading(true);
    try {
      const entryData = {
        exercise_id: exercise.id,
        sets: sets,
        notes: notes,
        entry_date: selectedDate,
        calories_burned: 0,
        image_url: imageUrl,
        imageFile: imageFile,
      };

      await createExerciseEntry(entryData);
      info(loggingLevel, `LogExerciseEntryDialog: Exercise entry saved successfully for ${exercise.name}`);
      toast({
        title: "Success",
        description: `Exercise "${exercise.name}" logged successfully.`,
        variant: "default",
      });
      onSaveSuccess();
      onClose();
    } catch (err) {
      error(loggingLevel, "LogExerciseEntryDialog: Error saving exercise entry:", err);
      toast({
        title: "Error",
        description: `Failed to log exercise: ${err instanceof Error ? err.message : String(err)}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const SortableSetItem = React.memo(({ set, index }: { set: WorkoutPresetSet, index: number }) => {
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
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 flex-grow">
          <div className="md:col-span-1"><Label>Set</Label><p className="font-medium p-2">{set.set_number}</p></div>
          <div className="md:col-span-2"><Label>Type</Label>
            <Select value={set.set_type} onValueChange={(value) => handleSetChange(index, 'set_type', value)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="Working Set">Working Set</SelectItem>
                <SelectItem value="Warm-up">Warm-up</SelectItem>
                <SelectItem value="Drop Set">Drop Set</SelectItem>
                <SelectItem value="Failure">Failure</SelectItem>
                <SelectItem value="AMRAP">AMRAP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1"><Label className="flex items-center"><Repeat className="h-4 w-4 mr-1" style={{ color: '#3b82f6' }} />Reps</Label><Input type="number" value={set.reps ?? ''} onChange={(e) => handleSetChange(index, 'reps', Number(e.target.value))} /></div>
          <div className="md:col-span-1"><Label className="flex items-center"><Weight className="h-4 w-4 mr-1" style={{ color: '#ef4444' }} />Weight</Label><Input type="number" value={set.weight ?? ''} onChange={(e) => handleSetChange(index, 'weight', Number(e.target.value))} /></div>
          <div className="md:col-span-1"><Label className="flex items-center"><Timer className="h-4 w-4 mr-1" style={{ color: '#f97316' }} />Duration</Label><Input type="number" value={set.duration ?? ''} onChange={(e) => handleSetChange(index, 'duration', Number(e.target.value))} /></div>
          <div className="md:col-span-1"><Label className="flex items-center"><Timer className="h-4 w-4 mr-1" style={{ color: '#8b5cf6' }} />Rest (s)</Label><Input type="number" value={set.rest_time ?? ''} onChange={(e) => handleSetChange(index, 'rest_time', Number(e.target.value))} /></div>
          <div className="col-span-1 md:col-span-6"><Label>Notes</Label><Textarea value={set.notes ?? ''} onChange={(e) => handleSetChange(index, 'notes', e.target.value)} /></div>
        </div>
        <div className="flex flex-col space-y-1">
          <Button variant="ghost" size="icon" onClick={() => handleDuplicateSet(index)}><Copy className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => handleRemoveSet(index)}><X className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Log Exercise: {exercise?.name}</DialogTitle>
          <DialogDescription>
            Enter details for your exercise session on {selectedDate}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sets.map((_, index) => `set-${index}`)}>
              <div className="space-y-2">
                {sets.map((set, index) => (
                  <SortableSetItem key={`set-${index}`} set={set} index={index} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <Button type="button" variant="outline" onClick={handleAddSet}>
            <Plus className="h-4 w-4 mr-2" /> Add Set
          </Button>
          <div className="space-y-2">
            <Label htmlFor="notes">Session Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="image">Upload Image</Label>
            <Input id="image" type="file" onChange={handleImageUpload} />
          </div>
        </div>
        {exercise && <ExerciseHistoryDisplay exerciseId={exercise.id} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !exercise}>
            {loading ? "Saving..." : "Save Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LogExerciseEntryDialog;