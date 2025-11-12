import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkoutPlanTemplate, WorkoutPlanAssignment, WorkoutPreset, WorkoutPresetSet } from "@/types/workout";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Plus, X, Repeat, Weight, Timer, ListOrdered, CalendarDays, GripVertical, Copy, Dumbbell, Hourglass } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getWorkoutPresets } from "@/services/workoutPresetService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadExercises } from "@/services/exerciseService";
import { Exercise } from "@/services/exerciseSearchService";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import AddExerciseDialog from "@/components/AddExerciseDialog";
import ExerciseHistoryDisplay from "./ExerciseHistoryDisplay";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug } from "@/utils/logging";

interface AddWorkoutPlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newPlan: Omit<WorkoutPlanTemplate, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => void;
  initialData?: WorkoutPlanTemplate | null;
  onUpdate?: (planId: string, updatedPlan: Partial<WorkoutPlanTemplate>) => void;
}

const daysOfWeek = [
  { id: 0, name: "Sunday" },
  { id: 1, name: "Monday" },
  { id: 2, name: "Tuesday" },
  { id: 3, name: "Wednesday" },
  { id: 4, name: "Thursday" },
  { id: 5, name: "Friday" },
  { id: 6, name: "Saturday" },
];

const SortableSetItem = React.memo(({ set, assignmentIndex, setIndex, handleSetChangeInPlan, handleDuplicateSetInPlan, handleRemoveSetInPlan, weightUnit }: { set: WorkoutPresetSet, assignmentIndex: number, setIndex: number, handleSetChangeInPlan: Function, handleDuplicateSetInPlan: Function, handleRemoveSetInPlan: Function, weightUnit: string }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `set-${assignmentIndex}-${setIndex}` });

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
            <Label>Set</Label>
            <p className="font-medium p-2">{set.set_number}</p>
          </div>
          <div className="md:col-span-2">
            <Label>Type</Label>
            <Select value={set.set_type} onValueChange={(value) => handleSetChangeInPlan(assignmentIndex, setIndex, 'set_type', value)}>
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
            <Label htmlFor={`reps-${assignmentIndex}-${setIndex}`} className="flex items-center">
              <Repeat className="h-4 w-4 mr-1" style={{ color: '#3b82f6' }} /> Reps
            </Label>
            <Input id={`reps-${assignmentIndex}-${setIndex}`} type="number" value={set.reps ?? ''} onChange={(e) => handleSetChangeInPlan(assignmentIndex, setIndex, 'reps', Number(e.target.value))} />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor={`weight-${assignmentIndex}-${setIndex}`} className="flex items-center">
              <Dumbbell className="h-4 w-4 mr-1" style={{ color: '#ef4444' }} /> Weight ({weightUnit})
            </Label>
            <Input id={`weight-${assignmentIndex}-${setIndex}`} type="number" value={set.weight ?? ''} onChange={(e) => handleSetChangeInPlan(assignmentIndex, setIndex, 'weight', Number(e.target.value))} />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor={`duration-${assignmentIndex}-${setIndex}`} className="flex items-center">
              <Timer className="h-4 w-4 mr-1" style={{ color: '#f97316' }} /> Duration (min)
            </Label>
            <Input id={`duration-${assignmentIndex}-${setIndex}`} type="number" value={set.duration ?? ''} onChange={(e) => handleSetChangeInPlan(assignmentIndex, setIndex, 'duration', Number(e.target.value))} />
          </div>
          <div className="md:col-span-1">
            <Label htmlFor={`rest-${assignmentIndex}-${setIndex}`} className="flex items-center">
              <Timer className="h-4 w-4 mr-1" style={{ color: '#8b5cf6' }} /> Rest (s)
            </Label>
            <Input id={`rest-${assignmentIndex}-${setIndex}`} type="number" value={set.rest_time ?? ''} onChange={(e) => handleSetChangeInPlan(assignmentIndex, setIndex, 'rest_time', Number(e.target.value))} />
          </div>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" onClick={() => handleDuplicateSetInPlan(assignmentIndex, setIndex)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleRemoveSetInPlan(assignmentIndex, setIndex)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="pl-8">
        <Label htmlFor={`notes-${assignmentIndex}-${setIndex}`}>Notes</Label>
        <Textarea id={`notes-${assignmentIndex}-${setIndex}`} value={set.notes ?? ''} onChange={(e) => handleSetChangeInPlan(assignmentIndex, setIndex, 'notes', e.target.value)} />
      </div>
    </div>
  );
});

const AddWorkoutPlanDialog: React.FC<AddWorkoutPlanDialogProps> = ({ isOpen, onClose, onSave, initialData, onUpdate }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { weightUnit, loggingLevel, convertWeight } = usePreferences();
  const [planName, setPlanName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [assignments, setAssignments] = useState<WorkoutPlanAssignment[]>([]);
  const [workoutPresets, setWorkoutPresets] = useState<WorkoutPreset[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isAddExerciseDialogOpen, setIsAddExerciseDialogOpen] = useState(false);
  const [selectedDayForAssignment, setSelectedDayForAssignment] = useState<number | null>(null);
  const [copiedAssignment, setCopiedAssignment] = useState<WorkoutPlanAssignment | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (user?.id) {
        fetchPresetsAndExercises();
      }

      if (initialData) {
        setPlanName(initialData.plan_name);
        setDescription(initialData.description);
        setStartDate(initialData.start_date ? new Date(initialData.start_date).toISOString().split('T')[0] : '');
        setEndDate(initialData.end_date ? new Date(initialData.end_date).toISOString().split('T')[0] : '');
        setIsActive(initialData.is_active);
        setAssignments(
          initialData.assignments?.map(a => ({
            ...a,
            sets: a.sets?.map(s => ({
              ...s,
              weight: parseFloat(convertWeight(s.weight, 'kg', weightUnit).toFixed(2))
            })) || []
          })) || []
        );
      } else {
        setPlanName("");
        setDescription("");
        setStartDate(new Date().toISOString().split('T')[0]);
        const today = new Date();
        today.setDate(today.getDate() + 7);
        setEndDate(today.toISOString().split('T')[0]);
        setIsActive(true);
        setAssignments([]);
      }
    } else {
      setPlanName("");
      setDescription("");
      setStartDate(new Date().toISOString().split('T')[0]);
      const today = new Date();
      today.setDate(today.getDate() + 7);
      setEndDate(today.toISOString().split('T')[0]);
      setIsActive(true);
      setAssignments([]);
    }
  }, [isOpen, user?.id, initialData]);

  const fetchPresetsAndExercises = async () => {
    if (!user?.id) return;
    try {
      const [presets, { exercises: fetchedExercises }] = await Promise.all([
        getWorkoutPresets(1, 1000), // Fetch all presets for selection
        loadExercises(user.id),
      ]);
      setWorkoutPresets(presets.presets);
      setExercises(fetchedExercises);
    } catch (error) {
      toast({
        title: t('addWorkoutPlanDialog.errorToastTitle', "Error"),
        description: t('addWorkoutPlanDialog.errorToastDescription', "Failed to load workout presets or exercises."),
        variant: "destructive",
      });
      console.error("Error fetching presets or exercises:", error);
    }
  };

  const handleRemoveAssignment = (index: number) => {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAssignmentChange = (index: number, field: keyof WorkoutPlanAssignment, value: any) => {
    setAssignments(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  const handleSetChangeInPlan = useCallback((assignmentIndex: number, setIndex: number, field: keyof WorkoutPresetSet, value: any) => {
    debug(loggingLevel, `[AddWorkoutPlanDialog] handleSetChangeInPlan: assignmentIndex=${assignmentIndex}, setIndex=${setIndex}, field=${field}, value=${value}, weightUnit=${weightUnit}`);
    setAssignments(prev =>
      prev.map((assignment, aIndex) => {
        if (aIndex !== assignmentIndex || !assignment.sets) {
          return assignment;
        }
        return {
          ...assignment,
          sets: assignment.sets.map((set, sIndex) => {
            if (sIndex !== setIndex) {
              return set;
            }
            return { ...set, [field]: value };
          }),
        };
      })
    );
  }, [loggingLevel, weightUnit, convertWeight]);

  const handleAddSetInPlan = useCallback((assignmentIndex: number) => {
    setAssignments(prev =>
      prev.map((assignment, aIndex) => {
        if (aIndex !== assignmentIndex || !assignment.sets || assignment.sets.length === 0) {
          return assignment;
        }
        const lastSet = assignment.sets[assignment.sets.length - 1];
        const newSet: WorkoutPresetSet = {
          ...lastSet,
          set_number: assignment.sets.length + 1,
        };
        return {
          ...assignment,
          sets: [...assignment.sets, newSet],
        };
      })
    );
  }, []);

  const handleDuplicateSetInPlan = useCallback((assignmentIndex: number, setIndex: number) => {
    setAssignments(prev =>
      prev.map((assignment, aIndex) => {
        if (aIndex !== assignmentIndex || !assignment.sets) {
          return assignment;
        }
        const sets = assignment.sets;
        const setToDuplicate = sets[setIndex];
        const newSets = [
          ...sets.slice(0, setIndex + 1),
          { ...setToDuplicate },
          ...sets.slice(setIndex + 1)
        ].map((s, i) => ({ ...s, set_number: i + 1 }));
        return { ...assignment, sets: newSets };
      })
    );
  }, []);

  const handleRemoveSetInPlan = useCallback((assignmentIndex: number, setIndex: number) => {
    setAssignments(prev =>
      prev.map((assignment, aIndex) => {
        if (aIndex !== assignmentIndex || !assignment.sets) {
          return assignment;
        }
        const newSets = assignment.sets.filter((_, sIndex) => sIndex !== setIndex)
                                       .map((s, i) => ({ ...s, set_number: i + 1 }));
        return { ...assignment, sets: newSets };
      }).filter(assignment => !assignment.exercise_id || (assignment.sets && assignment.sets.length > 0))
    );
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const activeId = String(active.id);
      const overId = String(over.id);

      const [activeType, activeAssignmentIndexStr, activeSetIndexStr] = activeId.split('-');
      const [overType, overAssignmentIndexStr, overSetIndexStr] = overId.split('-');

      if (activeType !== 'set' || overType !== 'set' || activeAssignmentIndexStr !== overAssignmentIndexStr) {
        return;
      }

      const assignmentIndex = parseInt(activeAssignmentIndexStr, 10);
      const oldIndex = parseInt(activeSetIndexStr, 10);
      const newIndex = parseInt(overSetIndexStr, 10);

      if (isNaN(assignmentIndex) || isNaN(oldIndex) || isNaN(newIndex)) {
        return;
      }

      setAssignments((items) =>
        items.map((assignment, index) => {
          if (index === assignmentIndex && assignment.sets) {
            const reorderedSets = arrayMove(assignment.sets, oldIndex, newIndex);
            return {
              ...assignment,
              sets: reorderedSets.map((set, index) => ({ ...set, set_number: index + 1 })),
            };
          }
          return assignment;
        })
      );
    }
  }, []);

  const handleAddExerciseOrPreset = (
    item: Exercise | WorkoutPreset,
    sourceMode: 'internal' | 'external' | 'custom' | 'preset'
  ) => {
    if (selectedDayForAssignment !== null) {
      if (sourceMode === 'preset') {
        const preset = item as WorkoutPreset;
        setAssignments((prev) => [
          ...prev,
          {
            day_of_week: selectedDayForAssignment,
            template_id: '',
            workout_preset_id: preset.id,
            exercise_id: undefined,
            sets: [], // Presets are expanded on the backend
          },
        ]);
      } else {
        const exercise = item as Exercise;
        setAssignments((prev) => [
          ...prev,
          {
            day_of_week: selectedDayForAssignment,
            template_id: '',
            workout_preset_id: undefined,
            exercise_id: exercise.id,
            exercise_name: exercise.name,
            sets: [{ set_number: 1, set_type: 'Working Set', reps: 10, weight: 0 }],
          },
        ]);
      }
      setIsAddExerciseDialogOpen(false);
      setSelectedDayForAssignment(null);
    }
  };

  const handleCopyAssignment = (assignment: WorkoutPlanAssignment) => {
    setCopiedAssignment({ ...assignment });
    toast({
      title: t('addWorkoutPlanDialog.copiedToastTitle', "Copied!"),
      description: t('addWorkoutPlanDialog.copiedToastDescription', { itemName: assignment.exercise_name || `${t('addWorkoutPlanDialog.presetLabel', "Preset:")} ${workoutPresets.find(p => p.id === assignment.workout_preset_id)?.name}` }),
    });
  };

  const handlePasteAssignment = (dayOfWeek: number) => {
    if (copiedAssignment) {
      const newAssignment: WorkoutPlanAssignment = {
        ...copiedAssignment,
        day_of_week: dayOfWeek,
        template_id: '', // Reset template_id for the new assignment
      };
      setAssignments((prev) => [...prev, newAssignment]);
      toast({
        title: t('addWorkoutPlanDialog.pastedToastTitle', "Pasted!"),
        description: t('addWorkoutPlanDialog.pastedToastDescription', { itemName: newAssignment.exercise_name || `${t('addWorkoutPlanDialog.presetLabel', "Preset:")} ${workoutPresets.find(p => p.id === newAssignment.workout_preset_id)?.name}` }),
      });
    }
  };

  const handleSave = () => {
    if (planName.trim() === "" || startDate.trim() === "") {
      toast({
        title: t('addWorkoutPlanDialog.validationErrorTitle', "Validation Error"),
        description: t('addWorkoutPlanDialog.validationErrorDescription', "Plan Name and Start Date are required."),
        variant: "destructive",
      });
      return;
    }

    const assignmentsToSave = assignments.filter(
      (assignment) => assignment.workout_preset_id || assignment.exercise_id
    );

    const planData = {
      plan_name: planName,
      description: description,
      start_date: startDate,
      end_date: endDate || null,
      is_active: isActive,
      assignments: assignmentsToSave.map(a => ({
        ...a,
        sets: a.sets?.map(s => ({
          ...s,
          weight: convertWeight(s.weight, weightUnit, 'kg')
        })) || []
      })),
    };

    if (initialData && onUpdate) {
      onUpdate(initialData.id, planData);
    } else if (onSave) {
      onSave(planData);
    }
    onClose();
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <TooltipProvider>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? t('addWorkoutPlanDialog.editTitle', "Edit Workout Plan") : t('addWorkoutPlanDialog.addTitle', "Add New Workout Plan")}</DialogTitle>
          <DialogDescription>
            {initialData ? t('addWorkoutPlanDialog.editDescription', "Edit the details for your workout plan and its assignments.") : t('addWorkoutPlanDialog.addDescription', "Enter the details for your new workout plan and assign workouts to days.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="planName">
              {t('addWorkoutPlanDialog.planNameLabel', "Plan Name")}
            </Label>
            <Input
              id="planName"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">
              {t('addWorkoutPlanDialog.descriptionLabel', "Description")}
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">
                {t('addWorkoutPlanDialog.startDateLabel', "Start Date")}
              </Label>
              <div className="relative">
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pr-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">
                {t('addWorkoutPlanDialog.endDateLabel', "End Date (Optional)")}
              </Label>
              <div className="relative">
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pr-8"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked as boolean)}
            />
            <Label htmlFor="isActive">
              {t('addWorkoutPlanDialog.setActiveLabel', "Set as active plan")}
            </Label>
          </div>
          <p className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mt-2" role="alert">
            <span className="font-bold">{t('addWorkoutPlanDialog.noteTitle', "Note:")}</span> {t('addWorkoutPlanDialog.noteDescription', "Updating an active plan adjusts upcoming exercise entries. Deleting a plan clears future ones, while previous entries stay in your log.")}
          </p>

          <div className="space-y-4">
            <h4 className="mb-2 text-lg font-medium">{t('addWorkoutPlanDialog.assignmentsTitle', "Assignments")}</h4>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {daysOfWeek.map((day) => (
                <Card key={day.id}>
                  <CardHeader>
                    <CardTitle>{day.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {assignments
                        .map((assignment, index) => ({ assignment, originalIndex: index }))
                        .filter(({ assignment }) => assignment.day_of_week === day.id)
                        .map(({ assignment, originalIndex }) => (
                          <div key={originalIndex} className="border p-4 rounded-md space-y-4">
                            {assignment.workout_preset_id ? (
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-medium">
                                    {t('addWorkoutPlanDialog.presetLabel', "Preset:")} {workoutPresets.find(p => p.id === assignment.workout_preset_id)?.name || "N/A"}
                                  </h4>
                                  {(() => {
                                    const preset = workoutPresets.find(p => p.id === assignment.workout_preset_id);
                                    if (preset && preset.exercises && preset.exercises.length > 0) {
                                      return (
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {preset.exercises.map((ex, idx) => (
                                            <p key={idx} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                              <span className="font-medium">{ex.exercise_name}</span>
                                              {ex.sets && <span className="flex items-center gap-1"><ListOrdered className="h-3 w-3" /> {ex.sets.length} {t('addWorkoutPlanDialog.setsLabel', "sets")}</span>}
                                            </p>
                                          ))}
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                                <div>
                                  <Button variant="ghost" size="icon" onClick={() => handleCopyAssignment(assignment)}>
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleRemoveAssignment(originalIndex)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold">{assignment.exercise_name}</h4>
                                  <div>
                                    <Button variant="ghost" size="icon" onClick={() => handleCopyAssignment(assignment)}>
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveAssignment(originalIndex)}>
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                                <SortableContext items={assignment.sets.map((_, index) => `set-${originalIndex}-${index}`)}>
                                  <div className="space-y-2">
                                    {assignment.sets.map((set, setIndex) => (
                                      <SortableSetItem
                                        key={`set-${originalIndex}-${setIndex}`}
                                        set={set}
                                        assignmentIndex={originalIndex}
                                        setIndex={setIndex}
                                        handleSetChangeInPlan={handleSetChangeInPlan}
                                        handleDuplicateSetInPlan={handleDuplicateSetInPlan}
                                        handleRemoveSetInPlan={handleRemoveSetInPlan}
                                        weightUnit={weightUnit}
                                      />
                                    ))}
                                  </div>
                                </SortableContext>
                                <Button type="button" variant="outline" onClick={() => handleAddSetInPlan(originalIndex)}>
                                  <Plus className="h-4 w-4 mr-2" /> {t('addWorkoutPlanDialog.addSetButton', "Add Set")}
                                </Button>
                                <ExerciseHistoryDisplay exerciseId={assignment.exercise_id!} />
                              </>
                            )}
                          </div>
                        ))}
                    </div>
                    <div className="flex space-x-2 mt-4">
                      <Button variant="outline" size="sm" onClick={() => {
                        setSelectedDayForAssignment(day.id);
                        setIsAddExerciseDialogOpen(true);
                      }}>
                        <Plus className="h-4 w-4 mr-2" /> {t('addWorkoutPlanDialog.addExercisePresetButton', "Add Exercise/Preset")}
                      </Button>
                      {copiedAssignment && (
                        <Button variant="outline" size="sm" onClick={() => handlePasteAssignment(day.id)}>
                          <Copy className="h-4 w-4 mr-2" /> {t('addWorkoutPlanDialog.pasteExerciseButton', "Paste Exercise")}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </DndContext>
          </div>
         </div>
         <DialogFooter>
           <DialogClose asChild>
             <Button variant="outline" onClick={onClose}>{t('addWorkoutPlanDialog.cancelButton', "Cancel")}</Button>
           </DialogClose>
           <Button onClick={handleSave}>{t('addWorkoutPlanDialog.saveButton', "Save Plan")}</Button>
         </DialogFooter>
       </DialogContent>
 
       <Dialog open={isAddExerciseDialogOpen} onOpenChange={setIsAddExerciseDialogOpen}>
         <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle>{t('addWorkoutPlanDialog.addExerciseOrPresetTitle', "Add Exercise or Preset")}</DialogTitle>
             <DialogDescription>
               {t('addWorkoutPlanDialog.addExerciseOrPresetDescription', "Select an exercise or a preset to add to the selected day.")}
             </DialogDescription>
           </DialogHeader>
           <AddExerciseDialog
             open={isAddExerciseDialogOpen}
             onOpenChange={setIsAddExerciseDialogOpen}
             onExerciseAdded={(exercise, sourceMode) => handleAddExerciseOrPreset(exercise, sourceMode)}
             onWorkoutPresetSelected={(preset) => handleAddExerciseOrPreset(preset, 'preset')}
             mode="workout-plan"
           />
         </DialogContent>
       </Dialog>
      </TooltipProvider>
    </Dialog>
    );
  };

export default AddWorkoutPlanDialog;