// pages/Exercises/AddCustomExerciseForm.tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { XCircle } from 'lucide-react';
import type { useAddCustomExerciseForm } from '@/hooks/Exercises/useAddCustomExerciseForm';

interface AddCustomExerciseFormProps {
  form: ReturnType<typeof useAddCustomExerciseForm>;
}

export default function AddCustomExerciseForm({
  form,
}: AddCustomExerciseFormProps) {
  const { t } = useTranslation();
  const {
    newExerciseName,
    setNewExerciseName,
    newExerciseCategory,
    setNewExerciseCategory,
    newExerciseCalories,
    manualCaloriesPerHour,
    setManualCaloriesPerHour,
    newExerciseDescription,
    setNewExerciseDescription,
    newExerciseSource,
    setNewExerciseSource,
    newExerciseForce,
    setNewExerciseForce,
    newExerciseLevel,
    setNewExerciseLevel,
    newExerciseMechanic,
    setNewExerciseMechanic,
    newExerciseEquipment,
    setNewExerciseEquipment,
    newExercisePrimaryMuscles,
    setNewExercisePrimaryMuscles,
    newExerciseSecondaryMuscles,
    setNewExerciseSecondaryMuscles,
    newExerciseInstructions,
    setNewExerciseInstructions,
    newExerciseImageUrls,
    handleAddCustomExercise,
    handleImageChange,
    handleRemoveImage,
    handleDragStart,
    handleDragOver,
    handleDrop,
  } = form;

  return (
    <div className="grid gap-4 py-4">
      {/* Name */}
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="name" className="text-right">
          {t('exercise.addExerciseDialog.nameLabel', 'Name')}
        </Label>
        <Input
          id="name"
          value={newExerciseName}
          onChange={(e) => setNewExerciseName(e.target.value)}
          className="col-span-3"
        />
      </div>

      {/* Category */}
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="category" className="text-right">
          {t('exercise.addExerciseDialog.categoryLabel', 'Category')}
        </Label>
        <Select
          onValueChange={setNewExerciseCategory}
          defaultValue={newExerciseCategory}
        >
          <SelectTrigger className="col-span-3">
            <SelectValue
              placeholder={t(
                'exercise.addExerciseDialog.selectCategoryPlaceholder',
                'Select a category'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">
              {t('exercise.addExerciseDialog.categoryGeneral', 'General')}
            </SelectItem>
            <SelectItem value="strength">
              {t('exercise.addExerciseDialog.categoryStrength', 'Strength')}
            </SelectItem>
            <SelectItem value="cardio">
              {t('exercise.addExerciseDialog.categoryCardio', 'Cardio')}
            </SelectItem>
            <SelectItem value="yoga">
              {t('exercise.addExerciseDialog.categoryYoga', 'Yoga')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Calories */}
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="calories" className="text-right">
          {t(
            'exercise.addExerciseDialog.caloriesPerHourLabel',
            'Calories/Hour'
          )}
        </Label>
        <Input
          id="calories"
          type="number"
          value={
            manualCaloriesPerHour !== undefined
              ? manualCaloriesPerHour.toString()
              : newExerciseCalories.toString()
          }
          onChange={(e) => setManualCaloriesPerHour(Number(e.target.value))}
          placeholder="Calculated: 300"
          className="col-span-3"
        />
        <p className="col-span-4 text-xs text-muted-foreground">
          {t(
            'exercise.addExerciseDialog.caloriesPerHourHint',
            'Leave blank to use system calculated calories per hour ({{newExerciseCalories}} cal/hour).',
            { newExerciseCalories }
          )}
        </p>
      </div>

      {/* Description */}
      <div className="grid grid-cols-4 items-start gap-4">
        <Label htmlFor="description" className="text-right mt-1">
          {t('exercise.addExerciseDialog.descriptionLabel', 'Description')}
        </Label>
        <Textarea
          id="description"
          value={newExerciseDescription}
          onChange={(e) => setNewExerciseDescription(e.target.value)}
          className="col-span-3"
        />
      </div>

      {/* Source */}
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="source" className="text-right">
          {t('exercise.addExerciseDialog.sourceLabel', 'Source')}
        </Label>
        <Input
          id="source"
          value={newExerciseSource}
          onChange={(e) => setNewExerciseSource(e.target.value)}
          className="col-span-3"
        />
      </div>

      {/* Force */}
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="force" className="text-right">
          {t('exercise.addExerciseDialog.forceLabel', 'Force')}
        </Label>
        <Select
          onValueChange={setNewExerciseForce}
          defaultValue={newExerciseForce}
        >
          <SelectTrigger className="col-span-3">
            <SelectValue
              placeholder={t(
                'exercise.addExerciseDialog.selectForcePlaceholder',
                'Select force'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pull">
              {t('exercise.addExerciseDialog.forcePull', 'Pull')}
            </SelectItem>
            <SelectItem value="push">
              {t('exercise.addExerciseDialog.forcePush', 'Push')}
            </SelectItem>
            <SelectItem value="static">
              {t('exercise.addExerciseDialog.forceStatic', 'Static')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Level */}
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="level" className="text-right">
          {t('exercise.addExerciseDialog.levelLabel', 'Level')}
        </Label>
        <Select
          onValueChange={setNewExerciseLevel}
          defaultValue={newExerciseLevel}
        >
          <SelectTrigger className="col-span-3">
            <SelectValue
              placeholder={t(
                'exercise.addExerciseDialog.selectLevelPlaceholder',
                'Select level'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beginner">
              {t('exercise.addExerciseDialog.levelBeginner', 'Beginner')}
            </SelectItem>
            <SelectItem value="intermediate">
              {t(
                'exercise.addExerciseDialog.levelIntermediate',
                'Intermediate'
              )}
            </SelectItem>
            <SelectItem value="expert">
              {t('exercise.addExerciseDialog.levelExpert', 'Expert')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mechanic */}
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="mechanic" className="text-right">
          {t('exercise.addExerciseDialog.mechanicLabel', 'Mechanic')}
        </Label>
        <Select
          onValueChange={setNewExerciseMechanic}
          defaultValue={newExerciseMechanic}
        >
          <SelectTrigger className="col-span-3">
            <SelectValue
              placeholder={t(
                'exercise.addExerciseDialog.selectMechanicPlaceholder',
                'Select mechanic'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="isolation">
              {t('exercise.addExerciseDialog.mechanicIsolation', 'Isolation')}
            </SelectItem>
            <SelectItem value="compound">
              {t('exercise.addExerciseDialog.mechanicCompound', 'Compound')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Equipment */}
      <div className="grid grid-cols-4 items-start gap-4">
        <Label htmlFor="equipment" className="text-right mt-1">
          {t(
            'exercise.addExerciseDialog.equipmentLabel',
            'Equipment (comma-separated)'
          )}
        </Label>
        <Textarea
          id="equipment"
          value={newExerciseEquipment}
          onChange={(e) => setNewExerciseEquipment(e.target.value)}
          className="col-span-3"
        />
      </div>

      {/* Primary Muscles */}
      <div className="grid grid-cols-4 items-start gap-4">
        <Label htmlFor="primaryMuscles" className="text-right mt-1">
          {t(
            'exercise.addExerciseDialog.primaryMusclesLabel',
            'Primary Muscles (comma-separated)'
          )}
        </Label>
        <Textarea
          id="primaryMuscles"
          value={newExercisePrimaryMuscles}
          onChange={(e) => setNewExercisePrimaryMuscles(e.target.value)}
          className="col-span-3"
        />
      </div>

      {/* Secondary Muscles */}
      <div className="grid grid-cols-4 items-start gap-4">
        <Label htmlFor="secondaryMuscles" className="text-right mt-1">
          {t(
            'exercise.addExerciseDialog.secondaryMusclesLabel',
            'Secondary Muscles (comma-separated)'
          )}
        </Label>
        <Textarea
          id="secondaryMuscles"
          value={newExerciseSecondaryMuscles}
          onChange={(e) => setNewExerciseSecondaryMuscles(e.target.value)}
          className="col-span-3"
        />
      </div>

      {/* Instructions */}
      <div className="grid grid-cols-4 items-start gap-4">
        <Label htmlFor="instructions" className="text-right mt-1">
          {t(
            'exercise.addExerciseDialog.instructionsLabel',
            'Instructions (one per line)'
          )}
        </Label>
        <Textarea
          id="instructions"
          value={newExerciseInstructions}
          onChange={(e) => setNewExerciseInstructions(e.target.value)}
          className="col-span-3"
        />
      </div>

      {/* Images */}
      <div className="grid grid-cols-4 items-start gap-4">
        <Label htmlFor="images" className="text-right mt-1">
          {t('exercise.addExerciseDialog.imagesLabel', 'Images')}
        </Label>
        <div className="col-span-3">
          <Input
            id="images"
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageChange}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {newExerciseImageUrls.map((url, index) => (
              <div
                key={index}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                className="relative w-24 h-24 cursor-grab"
              >
                <img
                  src={url}
                  alt={`preview ${index}`}
                  className="w-full h-full object-cover rounded"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                  onClick={() => handleRemoveImage(index)}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={handleAddCustomExercise}>
        {t('exercise.addExerciseDialog.addButton', 'Add Exercise')}
      </Button>
    </div>
  );
}
