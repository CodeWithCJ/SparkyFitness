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
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, warn } from '@/utils/logging';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';

interface CopyFoodEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (targetDate: string, targetMealType: string) => void;
  sourceMealType: string;
}

const CopyFoodEntryDialog = ({
  isOpen,
  onClose,
  onCopy,
  sourceMealType,
}: CopyFoodEntryDialogProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, loggingLevel } = usePreferences();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [selectedMealType, setSelectedMealType] =
    useState<string>(sourceMealType);

  const { data: availableMealTypes, isLoading: mealTypesLoading } =
    useMealTypes();

  const isAllDayCopy = sourceMealType === 'all';

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setSelectedMealType(sourceMealType);
    }
  }

  const handleCopyClick = () => {
    if (selectedDate) {
      const formattedDate = formatDateInUserTimezone(
        selectedDate,
        'yyyy-MM-dd'
      );
      info(
        loggingLevel,
        `Attempting to copy to date: ${formattedDate}, meal type: ${selectedMealType}`
      );
      onCopy(formattedDate, selectedMealType);
      onClose();
    } else {
      warn(loggingLevel, 'No date selected for copying.');
    }
  };

  const getDisplayName = (name: string) => {
    const lower = name.toLowerCase();
    if (lower === 'breakfast') return t('common.breakfast', 'Breakfast');
    if (lower === 'lunch') return t('common.lunch', 'Lunch');
    if (lower === 'dinner') return t('common.dinner', 'Dinner');
    if (lower === 'snacks') return t('common.snacks', 'Snacks');
    return name;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isAllDayCopy
              ? t('foodDiary.copyFoodEntryDialog.titleAll', 'Copy Entire Day')
              : t('foodDiary.copyFoodEntryDialog.title', 'Copy Food Entries')}
          </DialogTitle>
          <DialogDescription>
            {isAllDayCopy
              ? t(
                  'foodDiary.copyFoodEntryDialog.descriptionAll',
                  'Select the target date to copy all food entries from this day.'
                )
              : t(
                  'foodDiary.copyFoodEntryDialog.description',
                  'Select the target date and meal type to copy the food entries.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,auto)_1fr] sm:items-center sm:gap-4">
            <Label htmlFor="targetDate" className="text-start">
              {t('foodDiary.copyFoodEntryDialog.targetDate', 'Target Date')}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="targetDate"
                  type="button"
                  variant={'outline'}
                  className={cn(
                    'w-full justify-start text-start font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="me-2 h-4 w-4" aria-hidden="true" />
                  {selectedDate ? (
                    formatDateInUserTimezone(selectedDate, 'PPP')
                  ) : (
                    <span>{t('common.pickADate', 'Pick a date')}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    debug(loggingLevel, 'Selected date in dialog:', date);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
          {!isAllDayCopy && (
            <div className="grid gap-2 sm:grid-cols-[minmax(0,auto)_1fr] sm:items-center sm:gap-4">
              <Label htmlFor="mealType" className="text-start">
                {t('foodDiary.copyFoodEntryDialog.mealType', 'Meal Type')}
              </Label>
              <Select
                onValueChange={(value) => {
                  setSelectedMealType(value);
                  debug(loggingLevel, 'Selected meal type in dialog:', value);
                }}
                value={selectedMealType}
              >
                <SelectTrigger id="mealType" className="w-full">
                  <SelectValue
                    placeholder={t(
                      'foodDiary.copyFoodEntryDialog.selectMealTypePlaceholder',
                      'Select meal type'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {mealTypesLoading && (
                    <SelectItem value="loading" disabled>
                      {t('foodDiary.copyFoodEntryDialog.loadingMealTypes')}
                    </SelectItem>
                  )}
                  {!mealTypesLoading && availableMealTypes?.length === 0 && (
                    <SelectItem value="empty" disabled>
                      {t('foodDiary.copyFoodEntryDialog.noMealTypes')}
                    </SelectItem>
                  )}
                  {availableMealTypes?.map((meal) => (
                    <SelectItem key={meal.id} value={meal.name}>
                      {getDisplayName(meal.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleCopyClick}
            disabled={!selectedDate}
          >
            {t('foodDiary.copyFoodEntryDialog.copyButton', 'Copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyFoodEntryDialog;
