import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import MealBuilder from './MealBuilder';
import { Meal, MealFood } from '@/types/meal';
import { debug } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';

interface LogMealDialogProps {
    mealTemplate: Meal | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    date: string;
    mealType: string;
    onSave: () => void;
}

const LogMealDialog: React.FC<LogMealDialogProps> = ({
    mealTemplate,
    open,
    onOpenChange,
    date,
    mealType,
    onSave
}) => {
    const { loggingLevel } = usePreferences();

    const handleSave = () => {
        onSave();
        onOpenChange(false);
    };

    if (!mealTemplate) return null;

    // Ensure foods have necessary serving info for MealBuilder
    // The search result from repository usually includes flattened variant info, 
    // but let's make sure MealBuilder accepts it as MealFood[].
    // The repository returns fields that match MealFood interface quite well.
    const initialFoods = mealTemplate.foods || [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Log Meal: {mealTemplate.name}</DialogTitle>
                    <DialogDescription>
                        Adjust the portion size or ingredients for this meal entry.
                    </DialogDescription>
                </DialogHeader>
                <MealBuilder
                    mealId={mealTemplate.id} // Pass template ID so it can be linked
                    initialFoods={initialFoods}
                    onSave={handleSave}
                    onCancel={() => onOpenChange(false)}
                    source="food-diary"
                    foodEntryDate={date}
                    foodEntryMealType={mealType}
                    initialServingSize={mealTemplate.serving_size}
                    initialServingUnit={mealTemplate.serving_unit}
                />
            </DialogContent>
        </Dialog>
    );
};

export default LogMealDialog;
