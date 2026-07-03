// pages/Exercises/EditExerciseDialog.tsx
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { EXERCISE_CATEGORIES } from '@/constants/exercises';
import { useEditExerciseForm } from '@/hooks/Exercises/useEditExerciseForm';

interface EditExerciseDialogProps {
  form: ReturnType<typeof useEditExerciseForm>;
}

export default function EditExerciseDialog({ form }: EditExerciseDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={form.isEditDialogOpen}
      onOpenChange={form.setIsEditDialogOpen}
    >
      <DialogContent className="sm:max-w-[625px] overflow-y-auto max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            {t(
              'exercise.databaseManager.editExerciseDialogTitle',
              'Edit Exercise'
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'exercise.databaseManager.editExerciseDialogDescription',
              'Edit the details of the selected exercise.'
            )}
          </DialogDescription>
        </DialogHeader>

        {form.selectedExercise && (
          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                {t('exercise.addExerciseDialog.nameLabel', 'Name')}
              </Label>
              <Input
                id="edit-name"
                value={form.editExerciseName}
                onChange={(e) => form.setEditExerciseName(e.target.value)}
                className="col-span-3"
              />
            </div>

            {/* Category */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-category" className="text-right">
                {t('exercise.addExerciseDialog.categoryLabel', 'Category')}
              </Label>
              <Select
                onValueChange={form.setEditExerciseCategory}
                defaultValue={form.editExerciseCategory}
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
                  {EXERCISE_CATEGORIES.map(
                    ({ value, labelKey, defaultLabel }) => (
                      <SelectItem key={value} value={value}>
                        {t(labelKey, defaultLabel)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Calories/Hour */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-calories" className="text-right">
                {t(
                  'exercise.addExerciseDialog.caloriesPerHourLabel',
                  'Calories/Hour'
                )}
              </Label>
              <Input
                id="edit-calories"
                type="number"
                value={form.editExerciseCalories.toString()}
                onChange={(e) =>
                  form.setEditExerciseCalories(Number(e.target.value))
                }
                className="col-span-3"
              />
            </div>

            {/* Level */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-level" className="text-right">
                {t('exercise.addExerciseDialog.levelLabel', 'Level')}
              </Label>
              <Select
                onValueChange={form.setEditExerciseLevel}
                defaultValue={form.editExerciseLevel}
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

            {/* Force */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-force" className="text-right">
                {t('exercise.addExerciseDialog.forceLabel', 'Force')}
              </Label>
              <Select
                onValueChange={form.setEditExerciseForce}
                defaultValue={form.editExerciseForce}
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

            {/* Mechanic */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-mechanic" className="text-right">
                {t('exercise.addExerciseDialog.mechanicLabel', 'Mechanic')}
              </Label>
              <Select
                onValueChange={form.setEditExerciseMechanic}
                defaultValue={form.editExerciseMechanic}
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
                    {t(
                      'exercise.addExerciseDialog.mechanicIsolation',
                      'Isolation'
                    )}
                  </SelectItem>
                  <SelectItem value="compound">
                    {t(
                      'exercise.addExerciseDialog.mechanicCompound',
                      'Compound'
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Equipment */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-equipment" className="text-right mt-1">
                {t(
                  'exercise.addExerciseDialog.equipmentLabel',
                  'Equipment (comma-separated)'
                )}
              </Label>
              <Input
                id="edit-equipment"
                value={form.editExerciseEquipment.join(', ')}
                onChange={(e) =>
                  form.setEditExerciseEquipment(
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
                className="col-span-3"
              />
            </div>

            {/* Primary Muscles */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-primary-muscles" className="text-right mt-1">
                {t(
                  'exercise.addExerciseDialog.primaryMusclesLabel',
                  'Primary Muscles (comma-separated)'
                )}
              </Label>
              <Input
                id="edit-primary-muscles"
                value={form.editExercisePrimaryMuscles.join(', ')}
                onChange={(e) =>
                  form.setEditExercisePrimaryMuscles(
                    e.target.value.split(',').map((s) => s.trim())
                  )
                }
                className="col-span-3"
              />
            </div>

            {/* Secondary Muscles */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label
                htmlFor="edit-secondary-muscles"
                className="text-right mt-1"
              >
                {t(
                  'exercise.addExerciseDialog.secondaryMusclesLabel',
                  'Secondary Muscles (comma-separated)'
                )}
              </Label>
              <Input
                id="edit-secondary-muscles"
                value={form.editExerciseSecondaryMuscles.join(', ')}
                onChange={(e) =>
                  form.setEditExerciseSecondaryMuscles(
                    e.target.value.split(',').map((s) => s.trim())
                  )
                }
                className="col-span-3"
              />
            </div>

            {/* Instructions */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-instructions" className="text-right mt-1">
                {t(
                  'exercise.addExerciseDialog.instructionsLabel',
                  'Instructions (one per line)'
                )}
              </Label>
              <Textarea
                id="edit-instructions"
                value={form.editExerciseInstructions.join('\n')}
                onChange={(e) =>
                  form.setEditExerciseInstructions(
                    e.target.value.split('\n').map((s) => s.trim())
                  )
                }
                className="col-span-3"
              />
            </div>

            {/* Images */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-images" className="text-right mt-1">
                {t('exercise.addExerciseDialog.imagesLabel', 'Images')}
              </Label>
              <div className="col-span-3">
                <Input
                  id="edit-images"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files && form.handleImageFileChange(e.target.files)
                  }
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.editExerciseImages.map((url, index) => (
                    <div
                      key={`existing-${index}`}
                      draggable
                      onDragStart={() => form.setDraggedImageIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        form.handleDrop(index, false);
                      }}
                      className="relative w-24 h-24 cursor-grab"
                    >
                      <img
                        src={
                          url.startsWith('http')
                            ? url
                            : `/uploads/exercises/${url}`
                        }
                        alt={`existing ${index}`}
                        className="w-full h-full object-cover rounded"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                        onClick={() => form.removeExistingImage(index)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {form.newExerciseImageUrls.map((url, index) => (
                    <div
                      key={`new-${index}`}
                      draggable
                      onDragStart={() =>
                        form.setDraggedImageIndex(
                          form.editExerciseImages.length + index
                        )
                      }
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        form.handleDrop(
                          form.editExerciseImages.length + index,
                          true
                        );
                      }}
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
                        onClick={() => form.removeNewImage(index)}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-description" className="text-right mt-1">
                {t(
                  'exercise.addExerciseDialog.descriptionLabel',
                  'Description'
                )}
              </Label>
              <Textarea
                id="edit-description"
                value={form.editExerciseDescription}
                onChange={(e) =>
                  form.setEditExerciseDescription(e.target.value)
                }
                className="col-span-3"
              />
            </div>
          </div>
        )}

        <Button onClick={form.handleEditExercise}>
          {t('common.saveChanges', 'Save Changes')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
