import React from 'react';
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
    handleDragEnd,
    handleSubmit,
  } = useWorkoutPresetForm({ onSave, initialPreset });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        requireConfirmation
        className="sm:max-w-300 max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {initialPreset
              ? t('workoutPresetForm.editTitle', 'Edit Workout Preset')
              : t('workoutPresetForm.createTitle', 'Create New Workout Preset')}
          </DialogTitle>
          <DialogDescription>
            {initialPreset
              ? t(
                  'workoutPresetForm.editDescription',
                  'Edit the details of your workout preset.'
                )
              : t(
                  'workoutPresetForm.createDescription',
                  'Create a new workout preset by providing a name, description, and exercises.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 overflow-y-auto max-h-full">
          <div className="space-y-2">
            <Label htmlFor="name">
              {t('workoutPresetForm.nameLabel', 'Name')}
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">
              {t('workoutPresetForm.descriptionLabel', 'Description')}
            </Label>
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
            <Label htmlFor="isPublic">
              {t('workoutPresetForm.shareWithPublicLabel', 'Share with Public')}
            </Label>
          </div>

          <div className="col-span-4">
            <h3 className="text-lg font-semibold mb-2">
              {t('workoutPresetForm.exercisesLabel', 'Exercises')}
            </h3>
            <Button
              type="button"
              onClick={() => setIsAddExerciseDialogOpen(true)}
              className="mb-4"
            >
              <Plus className="h-4 w-4 mr-2" />{' '}
              {t('workoutPresetForm.addExerciseButton', 'Add Exercise')}
            </Button>

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
              <SortableContext items={exercises.map((ex) => ex.id as string)}>
                <div className="space-y-4">
                  {exercises.map((ex, exerciseIndex) => (
                    <SortableExerciseItem
                      key={ex.id}
                      ex={ex}
                      exerciseIndex={exerciseIndex}
                      handleRemoveExercise={handleRemoveExercise}
                      handleSetChange={handleSetChange}
                      handleDuplicateSet={handleDuplicateSet}
                      handleRemoveSet={handleRemoveSet}
                      handleAddSet={handleAddSet}
                      weightUnit={weightUnit}
                    />
                  ))}
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
