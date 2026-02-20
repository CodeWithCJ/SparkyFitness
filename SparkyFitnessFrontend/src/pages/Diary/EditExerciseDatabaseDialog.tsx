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

import type { Exercise } from '@/api/Exercises/exerciseSearchService';
import { error } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useUpdateExerciseMutation } from '@/hooks/Exercises/useExercises';

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
      const updatedData = {
        ...formData,
        calories_per_hour: convertEnergy(
          formData.calories_per_hour || 0,
          energyUnit,
          'kcal'
        ),
      };

      data.append('exerciseData', JSON.stringify(updatedData));
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

  const handleArrayStringChange = (field: keyof Exercise, value: string) => {
    handleFieldChange(
      field,
      value.split(',').map((s) => s.trim())
    );
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
              value={formData.category}
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
                {[
                  'general',
                  'strength',
                  'cardio',
                  'yoga',
                  'powerlifting',
                  'strongman',
                  'plyometrics',
                  'stretching',
                ].map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              value={formData.level}
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

          {/* Equipment */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              {t('exerciseCard.equipment', 'Equipment')}
            </Label>
            <Input
              value={(formData.equipment || []).join(', ')}
              onChange={(e) =>
                handleArrayStringChange('equipment', e.target.value)
              }
              className="col-span-3"
            />
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
                      src={
                        url.startsWith('http')
                          ? url
                          : `/uploads/exercises/${url}`
                      }
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
