import React, { useState, useCallback } from 'react';
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription, // Import DialogDescription
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from '@/utils/logging';

interface CopyFoodEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (targetDate: string, targetMealType: string) => void;
  sourceMealType: string;
}

const mealTypes = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snacks", label: "Snacks" },
];

const CopyFoodEntryDialog: React.FC<CopyFoodEntryDialogProps> = ({
  isOpen,
  onClose,
  onCopy,
  sourceMealType,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, loggingLevel } = usePreferences();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedMealType, setSelectedMealType] = useState<string>(sourceMealType);

  // Update selectedMealType when sourceMealType changes
  React.useEffect(() => {
    setSelectedMealType(sourceMealType);
  }, [sourceMealType]);

  const handleDateSelect = useCallback((date: Date | undefined) => {
    setSelectedDate(date);
    debug(loggingLevel, "Selected date in dialog:", date);
  }, [debug, loggingLevel]);

  const handleMealTypeChange = useCallback((value: string) => {
    setSelectedMealType(value);
    debug(loggingLevel, "Selected meal type in dialog:", value);
  }, [debug, loggingLevel]);

  const handleCopyClick = useCallback(() => {
    if (selectedDate) {
      const formattedDate = formatDateInUserTimezone(selectedDate, 'yyyy-MM-dd');
      info(loggingLevel, `Attempting to copy to date: ${formattedDate}, meal type: ${selectedMealType}`);
      onCopy(formattedDate, selectedMealType);
      onClose();
    } else {
      warn(loggingLevel, "No date selected for copying.");
    }
  }, [selectedDate, selectedMealType, onCopy, onClose, formatDateInUserTimezone, info, loggingLevel, warn]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('copyFoodEntryDialog.title', 'Copy Food Entries')}</DialogTitle>
          <DialogDescription>
            {t('copyFoodEntryDialog.description', 'Select the target date and meal type to copy the food entries.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="targetDate" className="text-right">
              {t('copyFoodEntryDialog.targetDate', 'Target Date')}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "col-span-3 justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : <span>{t('common.pickADate', 'Pick a date')}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="mealType" className="text-right">
              {t('copyFoodEntryDialog.mealType', 'Meal Type')}
            </Label>
            <Select onValueChange={handleMealTypeChange} value={selectedMealType}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('copyFoodEntryDialog.selectMealTypePlaceholder', 'Select meal type')} />
              </SelectTrigger>
              <SelectContent>
                {mealTypes.map((meal) => (
                  <SelectItem key={meal.value} value={meal.value}>
                    {t(`common.${meal.value}`, meal.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
          <Button onClick={handleCopyClick} disabled={!selectedDate}>{t('copyFoodEntryDialog.copyButton', 'Copy')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyFoodEntryDialog;