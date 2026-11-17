import type React from 'react';
import { useState } from 'react';
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
import { error } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useUpdateExerciseMutation } from '@/hooks/Exercises/useExercises';
import { Exercise } from '@/types/exercises';
import { HealthActivityTypeSelect } from '@/components/HealthActivityTypeSelect';
import { healthActivityTypeSelectValue } from '@/utils/healthActivityType';
import {
  EXERCISE_CATEGORIES,
  EXERCISE_MODALITY_OPTIONS,
} from '@/constants/exercises';
import {
  isExerciseModality,
  resolveExerciseModality,
  CANONICAL_MUSCLES,
  CANONICAL_EQUIPMENT,
  isCanonicalMuscle,
  isCanonicalEquipment,
  resolveCanonicalOrCustomMuscle,
  resolveCanonicalOrCustomEquipment,
} from '@workspace/shared';
import { resolveExerciseImageSrc } from '@/utils/exercises';
import { TagInput } from '@/components/ui/TagInput';
import { localizeMuscle, localizeEquipment } from '@/utils/exerciseTaxonomy';

interface EditExerciseDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseToEdit: Exercise | null;
  onSaveSuccess: () => void;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
}

const EditExerciseDatabaseDialog: React.FC<EditExerciseDatabaseDialogProps> = ({
  open,
  onOpenChange,
  exerciseToEdit,
  onSaveSuccess,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
}) => {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();
  const { mutateAsync: updateExercise } = useUpdateExerciseMutation();

  // 1. Alle Hooks MÜSSEN am Anfang stehen
  const [prevId, setPrevId] = useState<string | undefined>(undefined);
  const [formData, setFormData] = useState<Partial<Exercise>>({});
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  // 2. Derived State Sync (statt useEffect und ohne Early Return davor)
  if (exerciseToEdit && exerciseToEdit.id !== prevId) {
    setPrevId(exerciseToEdit.id);
    setFormData({
      name: exerciseToEdit.name || '',
      category: exerciseToEdit.category || '',
      modality: exerciseToEdit.modality,
      health_activity_type: healthActivityTypeSelectValue(
        exerciseToEdit.health_activity_type
      ),
      calories_per_hour: exerciseToEdit.calories_per_hour || 0,
      description: exerciseToEdit.description || '',
      level: exerciseToEdit.level?.toLowerCase() || '',
      force: exerciseToEdit.force?.toLowerCase() || '',
      mechanic: exerciseToEdit.mechanic?.toLowerCase() || '',
      equipment: Array.isArray(exerciseToEdit.equipment)
        ? exerciseToEdit.equipment
        : [],
      primary_muscles: Array.isArray(exerciseToEdit.primary_muscles)
        ? exerciseToEdit.primary_muscles
        : [],
      secondary_muscles: Array.isArray(exerciseToEdit.secondary_muscles)
        ? exerciseToEdit.secondary_muscles
        : [],
      instructions: Array.isArray(exerciseToEdit.instructions)
        ? exerciseToEdit.instructions
        : [],
      images: exerciseToEdit.images ? exerciseToEdit.images : [],
    });
    setImageFiles([]);
    setImageUrls([]);
  }

  const handleSaveExerciseDatabaseEdit = async () => {
    if (!exerciseToEdit) return;

    try {
      const data = new FormData();

      data.append('exerciseData', JSON.stringify(formData));
      imageFiles.forEach((file) => data.append('images', file));

      await updateExercise({ id: exerciseToEdit.id, payload: data });
      onOpenChange(false);
      onSaveSuccess();
    } catch (err) {
      error(loggingLevel, 'Error updating exercise in database:', err);
    }
  };

  const handleFieldChange = (field: keyof Exercise, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[625px] overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {t('exerciseCard.editExerciseInDatabase', 'Edit Exercise')}
          </DialogTitle>
          <DialogDescription>
            {t('exerciseCard.editExerciseDescription', 'Edit details below.')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              {t('exerciseCard.name', 'Name')}
            </Label>
            <Input
              id="name"
              value={formData.name || ''}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              className="col-span-3"
            />
          </div>

          {/* Category */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              {t('exerciseCard.category', 'Category')}
            </Label>
            <Select
              value={formData.category || undefined}
              onValueChange={(val) => handleFieldChange('category', val)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue
                  placeholder={t(
                    'exerciseCard.selectCategory',
                    'Select category'
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

          {/* Tracking type */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              {t('exercise.addExerciseDialog.modalityLabel', 'Tracking type')}
            </Label>
            <Select
              value={resolveExerciseModality(
                formData.modality,
                formData.category
              )}
              onValueChange={(val) => {
                if (isExerciseModality(val)) handleFieldChange('modality', val);
              }}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXERCISE_MODALITY_OPTIONS.map(
                  ({ value, labelKey, defaultLabel }) => (
                    <SelectItem key={value} value={value}>
                      {t(labelKey, defaultLabel)}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Health activity type (#1750) */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label
              htmlFor="db-health-activity-type"
              className="text-right pt-2"
            >
              {t(
                'exercise.addExerciseDialog.healthActivityTypeLabel',
                'Health activity type'
              )}
            </Label>
            <div className="col-span-3 space-y-1">
              <HealthActivityTypeSelect
                id="db-health-activity-type"
                value={healthActivityTypeSelectValue(
                  formData.health_activity_type
                )}
                onChange={(val) =>
                  handleFieldChange('health_activity_type', val)
                }
                exercise={{
                  name: formData.name,
                  category: formData.category,
                  modality: formData.modality,
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'exercise.addExerciseDialog.healthActivityTypeHint',
                  'Used when the mobile app writes your workouts to Apple Health or Health Connect.'
                )}
              </p>
            </div>
          </div>

          {/* Calories */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              {t(
                'exerciseCard.caloriesPerHour',
                `Calories/Hour (${getEnergyUnitString(energyUnit)})`
              )}
            </Label>
            <Input
              type="number"
              value={Math.round(
                convertEnergy(
                  formData.calories_per_hour || 0,
                  'kcal',
                  energyUnit
                )
              )}
              onChange={(e) =>
                handleFieldChange(
                  'calories_per_hour',
                  convertEnergy(Number(e.target.value), energyUnit, 'kcal')
                )
              }
              className="col-span-3"
            />
          </div>

          {/* Level */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              {t('exerciseCard.level', 'Level')}
            </Label>
            <Select
              value={formData.level || undefined}
              onValueChange={(val) => handleFieldChange('level', val)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">
                  {t('exerciseCard.levelBeginner', 'Beginner')}
                </SelectItem>
                <SelectItem value="intermediate">
                  {t('exerciseCard.levelIntermediate', 'Intermediate')}
                </SelectItem>
                <SelectItem value="expert">
                  {t('exerciseCard.levelExpert', 'Expert')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Force */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              {t('exerciseCard.force', 'Force')}
            </Label>
            <Select
              value={formData.force || undefined}
              onValueChange={(val) => handleFieldChange('force', val)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pull">
                  {t('exerciseCard.forcePull', 'Pull')}
                </SelectItem>
                <SelectItem value="push">
                  {t('exerciseCard.forcePush', 'Push')}
                </SelectItem>
                <SelectItem value="static">
                  {t('exerciseCard.forceStatic', 'Static')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mechanic */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              {t('exerciseCard.mechanic', 'Mechanic')}
            </Label>
            <Select
              value={formData.mechanic || undefined}
              onValueChange={(val) => handleFieldChange('mechanic', val)}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="isolation">
                  {t('exerciseCard.mechanicIsolation', 'Isolation')}
                </SelectItem>
                <SelectItem value="compound">
                  {t('exerciseCard.mechanicCompound', 'Compound')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Primary Muscles */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="db-primary-muscles" className="text-right mt-1">
              {t('exerciseCard.primaryMuscles', 'Primary Muscles')}
            </Label>
            <div className="col-span-3">
              <TagInput
                id="db-primary-muscles"
                value={formData.primary_muscles || []}
                onChange={(tags) => handleFieldChange('primary_muscles', tags)}
                suggestions={CANONICAL_MUSCLES}
                resolveValue={resolveCanonicalOrCustomMuscle}
                getLabel={(m) => localizeMuscle(t, m)}
                isCanonical={isCanonicalMuscle}
                showBodyMapHint
              />
            </div>
          </div>

          {/* Secondary Muscles */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="db-secondary-muscles" className="text-right mt-1">
              {t('exerciseCard.secondaryMuscles', 'Secondary Muscles')}
            </Label>
            <div className="col-span-3">
              <TagInput
                id="db-secondary-muscles"
                value={formData.secondary_muscles || []}
                onChange={(tags) =>
                  handleFieldChange('secondary_muscles', tags)
                }
                suggestions={CANONICAL_MUSCLES}
                resolveValue={resolveCanonicalOrCustomMuscle}
                getLabel={(m) => localizeMuscle(t, m)}
                isCanonical={isCanonicalMuscle}
                showBodyMapHint
              />
            </div>
          </div>

          {/* Equipment */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="db-equipment" className="text-right mt-1">
              {t('exerciseCard.equipment', 'Equipment')}
            </Label>
            <div className="col-span-3">
              <TagInput
                id="db-equipment"
                value={formData.equipment || []}
                onChange={(tags) => handleFieldChange('equipment', tags)}
                suggestions={CANONICAL_EQUIPMENT}
                resolveValue={resolveCanonicalOrCustomEquipment}
                getLabel={(eq) => localizeEquipment(t, eq)}
                isCanonical={isCanonicalEquipment}
              />
            </div>
          </div>

          {/* Instructions */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-1">
              {t('exerciseCard.instructions', 'Instructions')}
            </Label>
            <Textarea
              value={(formData.instructions || []).join('\n')}
              onChange={(e) =>
                handleFieldChange(
                  'instructions',
                  e.target.value.split('\n').map((s) => s.trim())
                )
              }
              className="col-span-3"
            />
          </div>

          {/* Images Logic */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-1">
              {t('exerciseCard.images', 'Images')}
            </Label>
            <div className="col-span-3 space-y-2">
              <Input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files) {
                    const files = Array.from(e.target.files);
                    setImageFiles((prev) => [...prev, ...files]);
                    files.forEach((file) => {
                      const reader = new FileReader();
                      reader.onloadend = () =>
                        setImageUrls((prev) => [
                          ...prev,
                          reader.result as string,
                        ]);
                      reader.readAsDataURL(file);
                    });
                  }
                }}
              />
              <div className="flex flex-wrap gap-2">
                {(formData.images || []).map((url, index) => (
                  <div key={`existing-${index}`} className="relative w-20 h-20">
                    <img
                      src={resolveExerciseImageSrc(url)}
                      className="w-full h-full object-cover rounded"
                      alt=""
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-1 -right-1 h-5 w-5"
                      onClick={() =>
                        handleFieldChange(
                          'images',
                          formData.images?.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <XCircle className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {imageUrls.map((url, index) => (
                  <div key={`new-${index}`} className="relative w-20 h-20">
                    <img
                      src={url}
                      className="w-full h-full object-cover rounded border-2 border-green-500"
                      alt=""
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-1 -right-1 h-5 w-5"
                      onClick={() => {
                        setImageFiles((prev) =>
                          prev.filter((_, i) => i !== index)
                        );
                        setImageUrls((prev) =>
                          prev.filter((_, i) => i !== index)
                        );
                      }}
                    >
                      <XCircle className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label className="text-right mt-1">
              {t('exerciseCard.description', 'Description')}
            </Label>
            <Textarea
              value={formData.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>

        <Button onClick={handleSaveExerciseDatabaseEdit}>
          {t('exerciseCard.saveChanges', 'Save Changes')}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default EditExerciseDatabaseDialog;
