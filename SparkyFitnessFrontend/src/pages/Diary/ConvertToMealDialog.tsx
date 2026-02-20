import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { debug } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useCreateMealFromDiaryMutation } from '@/hooks/Diary/useMealTypes';

interface ConvertToMealDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  mealType: string;
}

const ConvertToMealDialog = ({
  isOpen,
  onClose,
  selectedDate,
  mealType,
}: ConvertToMealDialogProps) => {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();
  const [mealName, setMealName] = useState(
    `${t(`common.${mealType}`, mealType)} - ${selectedDate}`
  );
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  const { mutate: createMealFromDiary, isPending: isLoading } =
    useCreateMealFromDiaryMutation();

  const handleSubmit = async () => {
    debug(loggingLevel, 'ConvertToMealDialog: Submitting new meal with data:', {
      mealName,
      description,
      isPublic,
      selectedDate,
      mealType,
    });
    createMealFromDiary(
      {
        date: selectedDate,
        mealType,
        mealName,
        description,
        isPublic,
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {t('mealCreation.convertToMeal', 'Create Meal from Diary')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'mealCreation.enterDetails',
              'Enter details for your new meal template.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="mealName" className="text-right">
              {t('mealCreation.mealName', 'Meal Name')}
            </Label>
            <Input
              id="mealName"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              className="col-span-3"
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              {t('mealCreation.description', 'Description')}
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="isPublic" className="text-right">
              {t('mealCreation.makePublic', 'Make Public')}
            </Label>
            <Switch
              id="isPublic"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              className="col-span-3"
              disabled={isLoading}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !mealName}>
            {isLoading
              ? t('common.creating', 'Creating...')
              : t('common.create', 'Create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertToMealDialog;
