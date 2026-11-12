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
import { addDays, format } from 'date-fns';
import { pickMealTypeForTime, userHourMinute } from '@workspace/shared';
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

export type CopyQuickTarget = 'now' | 'today' | 'tomorrow';

interface CopyFoodEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** `quickTarget` is the quick choice behind the date, if one was used. */
  onCopy: (
    targetDate: string,
    targetMealType: string,
    quickTarget: CopyQuickTarget | null
  ) => void;
  sourceMealType: string;
  /** Set when copying one food instead of a whole meal or day. */
  foodName?: string;
}

const CopyFoodEntryDialog = ({
  isOpen,
  onClose,
  onCopy,
  sourceMealType,
  foodName,
}: CopyFoodEntryDialogProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, loggingLevel, timezone } = usePreferences();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date()
  );
  const [selectedMealType, setSelectedMealType] =
    useState<string>(sourceMealType);

  const { data: availableMealTypes } = useMealTypes();

  const isAllDayCopy = sourceMealType === 'all';
  const isSingleFood = foodName !== undefined;
  const [quickTarget, setQuickTarget] = useState<CopyQuickTarget | null>(null);
  // Now logs a single food at the current time. Copying a meal or a day keeps
  // each entry's own time, so those get Today and Tomorrow only.
  const quickTargets: CopyQuickTarget[] = isSingleFood
    ? ['now', 'today', 'tomorrow']
    : ['today', 'tomorrow'];

  const applyQuickTarget = (target: CopyQuickTarget) => {
    setSelectedDate(
      target === 'tomorrow' ? addDays(new Date(), 1) : new Date()
    );
    // Now also picks the meal for the current time of day; Today and Tomorrow
    // keep the meal already chosen.
    if (target === 'now') {
      const mealType = pickMealTypeForTime(
        availableMealTypes ?? [],
        userHourMinute(timezone)
      );
      if (mealType) setSelectedMealType(mealType.name);
    }
    setQuickTarget(target);
  };

  const quickTargetLabel = (target: CopyQuickTarget) => {
    if (target === 'now') return t('copyFoodEntryDialog.quick.now', 'Now');
    if (target === 'today')
      return t('copyFoodEntryDialog.quick.today', 'Today');
    return t('copyFoodEntryDialog.quick.tomorrow', 'Tomorrow');
  };

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setSelectedMealType(sourceMealType);
      setQuickTarget(null);
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
      onCopy(formattedDate, selectedMealType, quickTarget);
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
            {isSingleFood
              ? t('copyFoodEntryDialog.titleFood', 'Copy {{food}}', {
                  food: foodName,
                })
              : isAllDayCopy
                ? t('copyFoodEntryDialog.titleAll', 'Copy Entire Day')
                : t('copyFoodEntryDialog.title', 'Copy Food Entries')}
          </DialogTitle>
          <DialogDescription>
            {isSingleFood
              ? t(
                  'copyFoodEntryDialog.descriptionFood',
                  'Log this food again now, or pick a date and meal type.'
                )
              : isAllDayCopy
                ? t(
                    'copyFoodEntryDialog.descriptionAll',
                    'Select the target date to copy all food entries from this day.'
                  )
                : t(
                    'copyFoodEntryDialog.description',
                    'Select the target date and meal type to copy the food entries.'
                  )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">
              {t('copyFoodEntryDialog.copyTo', 'Copy to')}
            </Label>
            <div className="col-span-3 flex flex-wrap gap-2">
              {quickTargets.map((target) => (
                <Button
                  key={target}
                  type="button"
                  size="sm"
                  variant={quickTarget === target ? 'default' : 'outline'}
                  aria-pressed={quickTarget === target}
                  onClick={() => applyQuickTarget(target)}
                >
                  {quickTargetLabel(target)}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="targetDate" className="text-right">
              {t('copyFoodEntryDialog.targetDate', 'Target Date')}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={'outline'}
                  className={cn(
                    'col-span-3 justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    <span>{format(selectedDate, 'PPP')}</span>
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
                    setQuickTarget(null);
                    debug(loggingLevel, 'Selected date in dialog:', date);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
          {!isAllDayCopy && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="mealType" className="text-right">
                {t('copyFoodEntryDialog.mealType', 'Meal Type')}
              </Label>
              <Select
                onValueChange={(value) => {
                  setSelectedMealType(value);
                  debug(loggingLevel, 'Selected meal type in dialog:', value);
                }}
                value={selectedMealType}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue
                    placeholder={t(
                      'copyFoodEntryDialog.selectMealTypePlaceholder',
                      'Select meal type'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableMealTypes?.length === 0 && (
                    <SelectItem value="loading" disabled>
                      {t('common.loading', 'Loading...')}
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
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleCopyClick} disabled={!selectedDate}>
            {t('copyFoodEntryDialog.copyButton', 'Copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyFoodEntryDialog;
