import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TooltipProvider } from '@/components/ui/tooltip';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  SortableExerciseItemData,
  WorkoutPlanTemplate,
} from '@/types/workout';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Plus, Clipboard } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import AddExerciseDialog from './AddExerciseDialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { DAYS_OF_WEEK } from '@/constants/exercises';
import { useWorkoutPlanAssignments } from '@/hooks/Exercises/useWorkoutPlanAssignments';
import { SortableExerciseItem } from './SortableExerciseItem';

interface AddWorkoutPlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    newPlan: Omit<
      WorkoutPlanTemplate,
      'id' | 'user_id' | 'created_at' | 'updated_at'
    >
  ) => void;
  initialData?: WorkoutPlanTemplate | null;
  onUpdate?: (
    planId: string,
    updatedPlan: Partial<WorkoutPlanTemplate>
  ) => void;
}

const AddWorkoutPlanDialog = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  onUpdate,
}: AddWorkoutPlanDialogProps) => {
  const {
    assignments,
    workoutPresets,
    copiedAssignment,
    isAddExerciseDialogOpen,
    setIsAddExerciseDialogOpen,
    setSelectedDayForAssignment,
    handleRemoveAssignment,
    handleSetChangeInPlan,
    handleAddSetInPlan,
    handleDuplicateSetInPlan,
    handleRemoveSetInPlan,
    handleDragEnd,
    handleAddExerciseOrPreset,
    handleCopyAssignment,
    handlePasteAssignment,
    buildAssignmentsForSave,
  } = useWorkoutPlanAssignments(initialData);
  const { t } = useTranslation();
  const { weightUnit } = usePreferences();
  const [planName, setPlanName] = useState(() => initialData?.plan_name || '');
  const [description, setDescription] = useState(
    () => initialData?.description || ''
  );

  const [startDate, setStartDate] = useState(() => {
    if (initialData?.start_date) {
      return String(initialData.start_date).split('T')[0];
    }
    return formatDateToYYYYMMDD(new Date());
  });

  const [endDate, setEndDate] = useState(() => {
    if (initialData?.end_date) {
      return String(initialData.end_date).split('T')[0];
    }
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return formatDateToYYYYMMDD(date);
  });

  const [isActive, setIsActive] = useState(
    () => initialData?.is_active ?? true
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSave = () => {
    if (planName.trim() === '' || startDate?.trim() === '') {
      toast({
        title: t(
          'addWorkoutPlanDialog.validationErrorTitle',
          'Validation Error'
        ),
        description: t(
          'addWorkoutPlanDialog.validationErrorDescription',
          'Plan Name and Start Date are required.'
        ),
        variant: 'destructive',
      });
      return;
    }

    const planData = {
      plan_name: planName,
      description,
      start_date: startDate,
      end_date: endDate || null,
      is_active: isActive,
      assignments: buildAssignmentsForSave(),
    };

    if (initialData && onUpdate) {
      onUpdate(initialData.id, planData);
    } else {
      onSave(planData);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <TooltipProvider>
        <DialogContent
          requireConfirmation
          className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {initialData
                ? t('addWorkoutPlanDialog.editTitle', 'Edit Workout Plan')
                : t('addWorkoutPlanDialog.addTitle', 'Add New Workout Plan')}
            </DialogTitle>
            <DialogDescription>
              {initialData
                ? t(
                    'addWorkoutPlanDialog.editDescription',
                    'Edit the details for your workout plan and its assignments.'
                  )
                : t(
                    'addWorkoutPlanDialog.addDescription',
                    'Enter the details for your new workout plan and assign workouts to days.'
                  )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="planName">
                {t('addWorkoutPlanDialog.planNameLabel', 'Plan Name')}
              </Label>
              <Input
                id="planName"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">
                {t('addWorkoutPlanDialog.descriptionLabel', 'Description')}
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
                  {t('addWorkoutPlanDialog.startDateLabel', 'Start Date')}
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
                  {t(
                    'addWorkoutPlanDialog.endDateLabel',
                    'End Date (Optional)'
                  )}
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
                {t('addWorkoutPlanDialog.setActiveLabel', 'Set as active plan')}
              </Label>
            </div>
            <p
              className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mt-2"
              role="alert"
            >
              <span className="font-bold">
                {t('addWorkoutPlanDialog.noteTitle', 'Note:')}
              </span>{' '}
              {t(
                'addWorkoutPlanDialog.noteDescription',
                'Updating an active plan adjusts upcoming exercise entries. Deleting a plan clears future ones, while previous entries stay in your log.'
              )}
            </p>

            <div className="space-y-4">
              <h4 className="mb-2 text-lg font-medium">
                {t('addWorkoutPlanDialog.assignmentsTitle', 'Assignments')}
              </h4>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                {DAYS_OF_WEEK.map((day) => {
                  const dayAssignments = assignments.filter(
                    (assignment) => assignment.day_of_week === day.id
                  );
                  return (
                    <Card key={day.name} className="p-4 bg-muted/30">
                      <SortableContext
                        items={dayAssignments.map((a) => a.id as string)}
                      >
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-primary">
                              {day.name}
                            </h3>
                            <div className="flex items-center space-x-2">
                              {copiedAssignment && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handlePasteAssignment(day.id)}
                                >
                                  <Clipboard className="h-4 w-4 mr-2" />{' '}
                                  {t(
                                    'addWorkoutPlanDialog.pasteButton',
                                    'Paste'
                                  )}
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedDayForAssignment(day.id);
                                  setIsAddExerciseDialogOpen(true);
                                }}
                              >
                                <Plus className="h-4 w-4 mr-2" />{' '}
                                {t(
                                  'addWorkoutPlanDialog.addExerciseButtonInDay',
                                  'Add Exercise'
                                )}
                              </Button>
                            </div>
                          </div>
                          {dayAssignments.map((assignment) => {
                            const originalIndex = assignments.findIndex(
                              (a) => a.id === assignment.id
                            );
                            return (
                              <SortableExerciseItem
                                key={assignment.id}
                                ex={assignment}
                                exerciseIndex={originalIndex}
                                weightUnit={weightUnit}
                                workoutPresets={workoutPresets}
                                onRemoveExercise={handleRemoveAssignment}
                                onSetChange={handleSetChangeInPlan}
                                onDuplicateSet={handleDuplicateSetInPlan}
                                onRemoveSet={handleRemoveSetInPlan}
                                onAddSet={handleAddSetInPlan}
                                onCopyExercise={
                                  handleCopyAssignment as (
                                    ex: SortableExerciseItemData
                                  ) => void
                                }
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    </Card>
                  );
                })}
              </DndContext>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={onClose}>
                {t('addWorkoutPlanDialog.cancelButton', 'Cancel')}
              </Button>
            </DialogClose>
            <Button onClick={handleSave}>
              {t('addWorkoutPlanDialog.saveButton', 'Save Plan')}
            </Button>
          </DialogFooter>
        </DialogContent>

        <Dialog
          open={isAddExerciseDialogOpen}
          onOpenChange={setIsAddExerciseDialogOpen}
        >
          <DialogContent
            requireConfirmation
            className="max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>
                {t(
                  'addWorkoutPlanDialog.addExerciseOrPresetTitle',
                  'Add Exercise or Preset'
                )}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'addWorkoutPlanDialog.addExerciseOrPresetDescription',
                  'Select an exercise or a preset to add to the selected day.'
                )}
              </DialogDescription>
            </DialogHeader>
            <AddExerciseDialog
              open={isAddExerciseDialogOpen}
              onOpenChange={setIsAddExerciseDialogOpen}
              onExerciseAdded={(exercise, sourceMode) => {
                if (exercise && sourceMode) {
                  handleAddExerciseOrPreset(exercise, sourceMode);
                }
              }}
              onWorkoutPresetSelected={(preset) =>
                handleAddExerciseOrPreset(preset, 'preset')
              }
              mode="workout-plan"
            />
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </Dialog>
  );
};

export default AddWorkoutPlanDialog;
