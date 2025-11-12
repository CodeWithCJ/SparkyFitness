import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext'; // Import usePreferences
import { debug, error } from '@/utils/logging'; // Import logging functions
import { toast } from '@/hooks/use-toast';
import { MealPlanTemplate, Meal, MealPlanTemplateAssignment } from '@/types/meal';
import { Food, FoodVariant } from '@/types/food';
import { getMeals } from '@/services/mealService';
import MealSelection from './MealSelection';
import FoodSearchDialog from './FoodSearchDialog';
import FoodUnitSelector from './FoodUnitSelector';

interface MealPlanTemplateFormProps {
    template?: MealPlanTemplate;
    onSave: (template: Partial<MealPlanTemplate>) => void;
    onClose: () => void;
}

const MealPlanTemplateForm: React.FC<MealPlanTemplateFormProps> = ({ template, onSave, onClose }) => {
    const { t } = useTranslation();
    const { activeUserId } = useActiveUser();
    const { loggingLevel } = usePreferences(); // Get loggingLevel from preferences
    const [planName, setPlanName] = useState(template?.plan_name || '');
    const [description, setDescription] = useState(template?.description || '');
    const [startDate, setStartDate] = useState(template?.start_date ? new Date(template.start_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(template?.end_date ? new Date(template.end_date).toISOString().split('T')[0] : new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0]);
    const [isActive, setIsActive] = useState(template?.is_active || false);
    const [assignments, setAssignments] = useState<MealPlanTemplateAssignment[]>(template?.assignments || []);
    const [isMealSelectionOpen, setIsMealSelectionOpen] = useState(false);
    const [isFoodSelectionOpen, setIsFoodSelectionOpen] = useState(false);
    const [isFoodUnitSelectorOpen, setIsFoodUnitSelectorOpen] = useState(false);
    const [selectedFood, setSelectedFood] = useState<Food | null>(null);
    const [currentDay, setCurrentDay] = useState<number | null>(null);
    const [currentMealType, setCurrentMealType] = useState<string | null>(null);

    const handleAddMeal = (day: number, mealType: string) => {
        setCurrentDay(day);
        setCurrentMealType(mealType);
        setIsMealSelectionOpen(true);
    };

    const handleAddFood = (day: number, mealType: string) => {
        setCurrentDay(day);
        setCurrentMealType(mealType);
        setIsFoodSelectionOpen(true);
    };

    const handleMealSelected = (meal: Meal) => {
        if (currentDay === null || currentMealType === null) return;
        setAssignments(prev => [...prev, { item_type: 'meal', day_of_week: currentDay, meal_type: currentMealType, meal_id: meal.id, meal_name: meal.name }]);
        setIsMealSelectionOpen(false);
    };

    const handleFoodSelected = (item: Food | Meal, type: 'food' | 'meal') => {
        if (currentDay === null || currentMealType === null) return;

        setIsFoodSelectionOpen(false);

        if (type === 'meal') {
            const meal = item as Meal;
            setAssignments(prev => [...prev, { item_type: 'meal', day_of_week: currentDay, meal_type: currentMealType, meal_id: meal.id, meal_name: meal.name }]);
        } else {
            const food = item as Food;
            setSelectedFood(food);
            setIsFoodUnitSelectorOpen(true);
        }
    };
  
    const handleFoodUnitSelected = (food: Food, quantity: number, unit: string, selectedVariant: FoodVariant) => {
      if (currentDay === null || currentMealType === null) return;
      setAssignments(prev => [...prev, {
          item_type: 'food',
          day_of_week: currentDay,
          meal_type: currentMealType,
          food_id: food.id,
          food_name: food.name,
          variant_id: selectedVariant.id,
          quantity: quantity,
          unit: unit,
      }]);
      setIsFoodUnitSelectorOpen(false);
      setSelectedFood(null);
    };

    const handleRemoveAssignment = (index: number) => {
        setAssignments(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        if (!planName.trim()) {
            toast({ title: t('common.error'), description: t('mealPlanTemplateForm.planNameEmptyError'), variant: 'destructive' });
            return;
        }
        if (endDate && startDate > endDate) {
            toast({ title: t('common.error'), description: t('mealPlanTemplateForm.endDateError'), variant: 'destructive' });
            return;
        }
        const dataToSave = {
            ...template,
            plan_name: planName,
            description,
            start_date: startDate,
            end_date: endDate,
            is_active: isActive,
            assignments,
        };
        debug(loggingLevel, 'MealPlanTemplateForm: Saving template data:', dataToSave); // Use debug
        onSave(dataToSave);
    };

    const daysOfWeek = [t('common.sunday', 'Sunday'), t('common.monday', 'Monday'), t('common.tuesday', 'Tuesday'), t('common.wednesday', 'Wednesday'), t('common.thursday', 'Thursday'), t('common.friday', 'Friday'), t('common.saturday', 'Saturday')];
    const mealTypes = [t('common.breakfast', 'breakfast'), t('common.lunch', 'lunch'), t('common.dinner', 'dinner'), t('common.snacks', 'snacks')];

    return (
        <>
            <Dialog open={true} onOpenChange={onClose}>
                <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{template ? t('mealPlanTemplateForm.editTitle') : t('mealPlanTemplateForm.createTitle')}</DialogTitle>
                        <DialogDescription>
                            {template ? t('mealPlanTemplateForm.editDescription') : t('mealPlanTemplateForm.createDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="planName">{t('mealPlanTemplateForm.planNameLabel')}</Label>
                            <Input id="planName" value={planName} onChange={e => setPlanName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">{t('mealPlanTemplateForm.descriptionLabel')}</Label>
                            <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="startDate">{t('mealPlanTemplateForm.startDateLabel')}</Label>
                                <Input id="startDate" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="endDate">{t('mealPlanTemplateForm.endDateLabel')}</Label>
                                <Input id="endDate" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <input type="checkbox" id="isActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                            <Label htmlFor="isActive">{t('mealPlanTemplateForm.setActiveLabel')}</Label>
                        </div>
                        <div className="space-y-4">
                            {daysOfWeek.map((day, dayIndex) => (
                                <div key={dayIndex}>
                                    <h3 className="text-lg font-semibold">{day}</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        {mealTypes.map(mealType => (
                                            <div key={mealType} className="p-4 border rounded-lg">
                                                <h4 className="font-semibold capitalize">{mealType}</h4>
                                                <div className="space-y-2 mt-2">
                                                      {assignments.filter(a => a.day_of_week === dayIndex && a.meal_type.toLowerCase() === mealType.toLowerCase()).map((assignment, index) => (
                                                          <div key={index} className="flex items-center justify-between bg-gray-100 p-2 rounded">
                                                              <span>
                                                                  {assignment.item_type === 'meal' ? assignment.meal_name : `${assignment.food_name} (${assignment.quantity} ${assignment.unit})`}
                                                              </span>
                                                              <Button variant="ghost" size="icon" onClick={() => handleRemoveAssignment(assignments.indexOf(assignment))}>{t('mealPlanTemplateForm.removeButton')}</Button>
                                                          </div>
                                                      ))}
                                                  </div>
                                                  <div className="flex space-x-2 mt-2">
                                                      <Button variant="outline" size="sm" onClick={() => handleAddFood(dayIndex, mealType)}>{t('mealPlanTemplateForm.addFoodOrMealButton')}</Button>
                                                  </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                        <Button onClick={handleSave}>{t('common.saveChanges')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {isMealSelectionOpen && (
                <Dialog open={isMealSelectionOpen} onOpenChange={setIsMealSelectionOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('mealPlanTemplateForm.selectMealTitle')}</DialogTitle>
                            <DialogDescription>
                                {t('mealPlanTemplateForm.selectMealDescription')}
                            </DialogDescription>
                        </DialogHeader>
                        <MealSelection onMealSelect={handleMealSelected} />
                    </DialogContent>
                </Dialog>
            )}

            <FoodSearchDialog
              open={isFoodSelectionOpen}
              onOpenChange={setIsFoodSelectionOpen}
              onFoodSelect={(item, type) => handleFoodSelected(item, type)}
              title={t('mealPlanTemplateForm.addFoodToMealPlanTitle')}
              description={t('mealPlanTemplateForm.addFoodToMealPlanDescription')}
            />
      
            {selectedFood && (
              <FoodUnitSelector
                food={selectedFood}
                open={isFoodUnitSelectorOpen}
                onOpenChange={setIsFoodUnitSelectorOpen}
                onSelect={handleFoodUnitSelected}
              />
            )}
        </>
    );
};

export default MealPlanTemplateForm;