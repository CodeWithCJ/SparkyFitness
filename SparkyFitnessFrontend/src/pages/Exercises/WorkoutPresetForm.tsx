import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { WorkoutPreset } from '@/types/workout';
import AddExerciseDialog from './AddExerciseDialog';
import { Plus } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { SortableExerciseItem } from './SortableExerciseItem';
import { useWorkoutPresetForm } from '@/hooks/Exercises/useWorkoutPresetForm';

interface WorkoutPresetFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    preset: Omit<WorkoutPreset, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ) => void;
  initialPreset?: WorkoutPreset | null;
}

const WorkoutPresetForm: React.FC<WorkoutPresetFormProps> = ({
  isOpen,
  onClose,
  onSave,
  initialPreset,
}) => {
  const { t } = useTranslation();
  const { weightUnit } = usePreferences();

  const {
    name,
    description,
    isPublic,
    exercises,
    isAddExerciseDialogOpen,
    sensors,
    setName,
    setDescription,
    setIsPublic,
    setIsAddExerciseDialogOpen,
    handleAddExercise,
    handleRemoveExercise,
    handleSetChange,
    handleAddSet,
    handleDuplicateSet,
    handleRemoveSet,
    handleReorderSets, // <--- Destructured here
    handleDragEnd,
    handleSubmit,
  } = useWorkoutPresetForm({ onSave, initialPreset });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        requireConfirmation
        className="max-w-[95vw] sm:max-w-[1200px] max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {initialPreset
              ? t('workoutPresetForm.editTitle', 'Edit Workout Preset')
              : t('workoutPresetForm.createTitle', 'Create Workout Preset')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-2 px-2">
          <div className="grid gap-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex-1 space-y-1">
                <Label htmlFor="name" className="text-xs font-semibold">
                  {t('workoutPresetForm.nameLabel', 'Preset Name')}
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="flex items-center gap-2 pt-0 md:pt-5">
                <Switch
                  id="isPublic"
                  checked={isPublic}
                  onCheckedChange={setIsPublic}
                />
                <Label htmlFor="isPublic" className="text-sm font-medium">
                  {t('workoutPresetForm.shareWithPublicLabel', 'Public Preset')}
                </Label>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs font-semibold">
                {t('workoutPresetForm.descriptionLabel', 'Description')}
              </Label>
              <Textarea
                id="description"
                className="resize-none h-16"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                {t('workoutPresetForm.exercisesLabel', 'Exercises')}
              </h3>
              <Button
                type="button"
                size="sm"
                onClick={() => setIsAddExerciseDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('workoutPresetForm.addExerciseButton', 'Add Exercise')}
              </Button>
            </div>

            <AddExerciseDialog
              open={isAddExerciseDialogOpen}
              onOpenChange={setIsAddExerciseDialogOpen}
              onExerciseAdded={handleAddExercise}
              mode="preset"
            />

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={exercises
                  .map((ex) => {
                    const safeEx = ex as {
                      _dndId?: string;
                      id?: string | number;
                    };
                    return safeEx._dndId || safeEx.id?.toString() || '';
                  })
                  .filter(Boolean)}
              >
                <div className="space-y-4">
                  {exercises.map((ex, exerciseIndex) => {
                    const safeEx = ex as {
                      _dndId?: string;
                      id?: string | number;
                    };
                    const dndId = safeEx._dndId || safeEx.id?.toString();

                    return (
                      <SortableExerciseItem
                        key={dndId}
                        ex={ex}
                        exerciseIndex={exerciseIndex}
                        weightUnit={weightUnit}
                        onRemoveExercise={handleRemoveExercise}
                        onSetChange={handleSetChange}
                        onDuplicateSet={handleDuplicateSet}
                        onRemoveSet={handleRemoveSet}
                        onAddSet={handleAddSet}
                        onReorderSets={handleReorderSets}
                        simplified
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit}>
            {initialPreset
              ? t('common.saveChanges', 'Save Changes')
              : t('workoutPresetForm.createPresetButton', 'Create Preset')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkoutPresetForm;
