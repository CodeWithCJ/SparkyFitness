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
import { getMeals, getMealById } from '@/services/mealService';
import { getFoodById } from '@/services/foodService';
import MealSelection from './MealSelection';
import FoodSearchDialog from './FoodSearchDialog';
import FoodUnitSelector from './FoodUnitSelector';
import MealUnitSelector from './MealUnitSelector';
import { Edit, X } from 'lucide-react';

// Extended assignment type with nutrition data for display
interface ExtendedAssignment extends MealPlanTemplateAssignment {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    serving_size?: number;
    serving_unit?: string;
}

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
    const [extendedAssignments, setExtendedAssignments] = useState<ExtendedAssignment[]>([]);
    const [isMealSelectionOpen, setIsMealSelectionOpen] = useState(false);
    const [isFoodSelectionOpen, setIsFoodSelectionOpen] = useState(false);
    const [isFoodUnitSelectorOpen, setIsFoodUnitSelectorOpen] = useState(false);
    const [isMealUnitSelectorOpen, setIsMealUnitSelectorOpen] = useState(false);
    const [selectedFood, setSelectedFood] = useState<Food | null>(null);
    const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
    const [currentDay, setCurrentDay] = useState<number | null>(null);
    const [currentMealType, setCurrentMealType] = useState<string | null>(null);
    const [editingAssignmentIndex, setEditingAssignmentIndex] = useState<number | null>(null);

    // Helper function to fetch nutrition data for an assignment
    const fetchNutritionForAssignment = async (assignment: MealPlanTemplateAssignment): Promise<ExtendedAssignment> => {
        try {
            if (assignment.item_type === 'meal' && assignment.meal_id && activeUserId) {
                const meal = await getMealById(activeUserId, assignment.meal_id);
                if (meal && meal.foods) {
                    // Calculate total nutrition from meal's component foods
                    let totalCalories = 0;
                    let totalProtein = 0;
                    let totalCarbs = 0;
                    let totalFat = 0;

                    meal.foods.forEach(mf => {
                        const scale = mf.quantity / (mf.serving_size || 1);
                        totalCalories += (mf.calories || 0) * scale;
                        totalProtein += (mf.protein || 0) * scale;
                        totalCarbs += (mf.carbs || 0) * scale;
                        totalFat += (mf.fat || 0) * scale;
                    });

                    return {
                        ...assignment,
                        calories: totalCalories,
                        protein: totalProtein,
                        carbs: totalCarbs,
                        fat: totalFat,
                        serving_size: meal.serving_size || 1,
                        serving_unit: meal.serving_unit || 'serving'
                    };
                }
            } else if (assignment.item_type === 'food' && assignment.food_id && activeUserId) {
                const food = await getFoodById(assignment.food_id);
                if (food && food.default_variant) {
                    const variant = food.default_variant;
                    return {
                        ...assignment,
                        calories: variant.calories,
                        protein: variant.protein,
                        carbs: variant.carbs,
                        fat: variant.fat,
                        serving_size: variant.serving_size,
                        serving_unit: variant.serving_unit
                    };
                }
            }
        } catch (err) {
            error(loggingLevel, `Failed to fetch nutrition for assignment:`, err);
        }
        return { ...assignment }; // Return without nutrition if fetch fails
    };

    // Fetch nutrition data for existing assignments when template loads
    useEffect(() => {
        const loadNutritionForAssignments = async () => {
            if (template?.assignments && template.assignments.length > 0 && activeUserId) {
                const extendedPromises = template.assignments.map(assignment =>
                    fetchNutritionForAssignment(assignment)
                );
                const extendedResults = await Promise.all(extendedPromises);
                setExtendedAssignments(extendedResults);
            }
        };

        loadNutritionForAssignments();
    }, [template?.id, activeUserId]); // Only run when template ID changes


    const handleAddFood = (day: number, mealType: string) => {
        setCurrentDay(day);
        setCurrentMealType(mealType);
        setIsFoodSelectionOpen(true);
    };

    const handleMealSelected = (meal: Meal) => {
        if (currentDay === null || currentMealType === null) return;
        setIsMealSelectionOpen(false);
        // Instead of immediately adding, open quantity selector
        setSelectedMeal(meal);
        setIsMealUnitSelectorOpen(true);
    };

    const handleMealUnitSelected = async (meal: Meal, quantity: number, unit: string) => {
        if (currentDay === null || currentMealType === null) return;

        if (editingAssignmentIndex !== null) {
            // Update existing assignment
            const updatedAssignment: MealPlanTemplateAssignment = {
                ...assignments[editingAssignmentIndex],
                quantity,
                unit
            };
            const updatedAssignments = [...assignments];
            updatedAssignments[editingAssignmentIndex] = updatedAssignment;
            setAssignments(updatedAssignments);

            // Update extended assignments
            const extendedAssignment = await fetchNutritionForAssignment(updatedAssignment);
            const updatedExtended = [...extendedAssignments];
            updatedExtended[editingAssignmentIndex] = extendedAssignment;
            setExtendedAssignments(updatedExtended);

            setEditingAssignmentIndex(null);
        } else {
            // Add new assignment
            const newAssignment: MealPlanTemplateAssignment = {
                item_type: 'meal',
                day_of_week: currentDay,
                meal_type: currentMealType,
                meal_id: meal.id,
                meal_name: meal.name,
                quantity: quantity,
                unit: unit
            };
            setAssignments(prev => [...prev, newAssignment]);

            // Fetch and add to extended assignments
            const extendedAssignment = await fetchNutritionForAssignment(newAssignment);
            setExtendedAssignments(prev => [...prev, extendedAssignment]);
        }

        setIsMealUnitSelectorOpen(false);
        setSelectedMeal(null);
    };

    const handleFoodSelected = (item: Food | Meal, type: 'food' | 'meal') => {
        if (currentDay === null || currentMealType === null) return;

        setIsFoodSelectionOpen(false);

        if (type === 'meal') {
            const meal = item as Meal;
            // Open quantity selector for meals instead of directly adding
            setSelectedMeal(meal);
            setIsMealUnitSelectorOpen(true);
        } else {
            const food = item as Food;
            setSelectedFood(food);
            setIsFoodUnitSelectorOpen(true);
        }
    };

    const handleFoodUnitSelected = async (food: Food, quantity: number, unit: string, selectedVariant: FoodVariant) => {
        if (currentDay === null || currentMealType === null) return;

        if (editingAssignmentIndex !== null) {
            // Update existing assignment
            const updatedAssignment: MealPlanTemplateAssignment = {
                ...assignments[editingAssignmentIndex],
                quantity,
                unit,
                variant_id: selectedVariant.id
            };
            const updatedAssignments = [...assignments];
            updatedAssignments[editingAssignmentIndex] = updatedAssignment;
            setAssignments(updatedAssignments);

            // Update extended assignments with nutrition data
            const extendedAssignment: ExtendedAssignment = {
                ...updatedAssignment,
                calories: selectedVariant.calories,
                protein: selectedVariant.protein,
                carbs: selectedVariant.carbs,
                fat: selectedVariant.fat,
                serving_size: selectedVariant.serving_size,
                serving_unit: selectedVariant.serving_unit
            };
            const updatedExtended = [...extendedAssignments];
            updatedExtended[editingAssignmentIndex] = extendedAssignment;
            setExtendedAssignments(updatedExtended);

            setEditingAssignmentIndex(null);
        } else {
            // Add new assignment
            const newAssignment: MealPlanTemplateAssignment = {
                item_type: 'food',
                day_of_week: currentDay,
                meal_type: currentMealType,
                food_id: food.id,
                food_name: food.name,
                variant_id: selectedVariant.id,
                quantity: quantity,
                unit: unit,
            };
            setAssignments(prev => [...prev, newAssignment]);

            // Add to extended assignments with nutrition data
            const extendedAssignment: ExtendedAssignment = {
                ...newAssignment,
                calories: selectedVariant.calories,
                protein: selectedVariant.protein,
                carbs: selectedVariant.carbs,
                fat: selectedVariant.fat,
                serving_size: selectedVariant.serving_size,
                serving_unit: selectedVariant.serving_unit
            };
            setExtendedAssignments(prev => [...prev, extendedAssignment]);
        }

        setIsFoodUnitSelectorOpen(false);
        setSelectedFood(null);
    };

    const handleRemoveAssignment = (index: number) => {
        setAssignments(prev => prev.filter((_, i) => i !== index));
        setExtendedAssignments(prev => prev.filter((_, i) => i !== index));
    };

    const handleEditAssignment = async (index: number) => {
        const assignment = extendedAssignments[index];
        if (!assignment) return;

        setEditingAssignmentIndex(index);

        if (assignment.item_type === 'meal' && assignment.meal_id && activeUserId) {
            try {
                const meal = await getMealById(activeUserId, assignment.meal_id);
                setSelectedMeal(meal);
                setIsMealUnitSelectorOpen(true);
            } catch (err) {
                error(loggingLevel, 'Failed to fetch meal for editing:', err);
            }
        } else if (assignment.item_type === 'food' && assignment.food_id) {
            try {
                const food = await getFoodById(assignment.food_id);
                setSelectedFood(food);
                setIsFoodUnitSelectorOpen(true);
            } catch (err) {
                error(loggingLevel, 'Failed to fetch food for editing:', err);
            }
        }
    };

    // Calculate nutrition totals for a specific meal type on a specific day
    const calculateMealTypeNutrition = (dayIndex: number, mealType: string) => {
        const relevantAssignments = extendedAssignments.filter(
            a => a.day_of_week === dayIndex && a.meal_type.toLowerCase() === mealType.toLowerCase()
        );

        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;

        relevantAssignments.forEach(assignment => {
            const scale = (assignment.quantity || 1) / (assignment.serving_size || 1);
            totalCalories += (assignment.calories || 0) * scale;
            totalProtein += (assignment.protein || 0) * scale;
            totalCarbs += (assignment.carbs || 0) * scale;
            totalFat += (assignment.fat || 0) * scale;
        });

        return { totalCalories, totalProtein, totalCarbs, totalFat };
    };

    // Calculate total nutrition for an entire day
    const calculateDailyNutrition = (dayIndex: number) => {
        const relevantAssignments = extendedAssignments.filter(
            a => a.day_of_week === dayIndex
        );

        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFat = 0;

        relevantAssignments.forEach(assignment => {
            const scale = (assignment.quantity || 1) / (assignment.serving_size || 1);
            totalCalories += (assignment.calories || 0) * scale;
            totalProtein += (assignment.protein || 0) * scale;
            totalCarbs += (assignment.carbs || 0) * scale;
            totalFat += (assignment.fat || 0) * scale;
        });

        return { totalCalories, totalProtein, totalCarbs, totalFat };
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
                            {daysOfWeek.map((day, dayIndex) => {
                                const dailyTotals = calculateDailyNutrition(dayIndex);
                                const hasDailyAssignments = extendedAssignments.some(a => a.day_of_week === dayIndex);

                                return (
                                    <div key={dayIndex}>
                                        <h3 className="text-lg font-semibold">{day}</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            {mealTypes.map(mealType => {
                                                const mealTypeTotals = calculateMealTypeNutrition(dayIndex, mealType);
                                                const assignmentsForMealType = extendedAssignments.filter(
                                                    a => a.day_of_week === dayIndex && a.meal_type.toLowerCase() === mealType.toLowerCase()
                                                );

                                                return (
                                                    <div key={mealType} className="p-4 border rounded-lg">
                                                        <h4 className="font-semibold capitalize">{mealType}</h4>
                                                        <div className="space-y-2 mt-2">
                                                            {assignmentsForMealType.map((assignment, idx) => {
                                                                const actualIndex = extendedAssignments.indexOf(assignment);
                                                                const scale = (assignment.quantity || 1) / (assignment.serving_size || 1);
                                                                const calories = (assignment.calories || 0) * scale;
                                                                const protein = (assignment.protein || 0) * scale;
                                                                const carbs = (assignment.carbs || 0) * scale;
                                                                const fat = (assignment.fat || 0) * scale;

                                                                return (
                                                                    <div key={idx} className="flex flex-col p-3 border rounded-md space-y-2 bg-white">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="font-medium">
                                                                                {assignment.item_type === 'meal' ? assignment.meal_name : assignment.food_name}
                                                                            </span>
                                                                            <div className="flex items-center space-x-1">
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    onClick={() => handleEditAssignment(actualIndex)}
                                                                                    title="Edit quantity"
                                                                                >
                                                                                    <Edit className="h-4 w-4" />
                                                                                </Button>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    onClick={() => handleRemoveAssignment(actualIndex)}
                                                                                    title="Remove"
                                                                                >
                                                                                    <X className="h-4 w-4" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex flex-col sm:flex-row justify-between text-sm text-muted-foreground">
                                                                            <div>
                                                                                {assignment.quantity || 1} {assignment.unit || 'serving'}
                                                                            </div>
                                                                            <div className="flex space-x-3 mt-1 sm:mt-0">
                                                                                <span>{calories.toFixed(0)} kcal</span>
                                                                                <span className="text-blue-500">P: {protein.toFixed(1)}g</span>
                                                                                <span className="text-green-500">C: {carbs.toFixed(1)}g</span>
                                                                                <span className="text-yellow-500">F: {fat.toFixed(1)}g</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        {assignmentsForMealType.length > 0 && (
                                                            <div className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded">
                                                                <strong>Total:</strong> {mealTypeTotals.totalCalories.toFixed(0)} kcal |
                                                                {' '}P: {mealTypeTotals.totalProtein.toFixed(1)}g |
                                                                {' '}C: {mealTypeTotals.totalCarbs.toFixed(1)}g |
                                                                {' '}F: {mealTypeTotals.totalFat.toFixed(1)}g
                                                            </div>
                                                        )}
                                                        <div className="flex space-x-2 mt-2">
                                                            <Button variant="outline" size="sm" onClick={() => handleAddFood(dayIndex, mealType)}>
                                                                {t('mealPlanTemplateForm.addFoodOrMealButton')}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {hasDailyAssignments && (
                                            <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
                                                <h4 className="font-semibold text-sm mb-2">Daily Total for {day}</h4>
                                                <div className="text-sm space-x-4">
                                                    <span className="font-medium">{dailyTotals.totalCalories.toFixed(0)} kcal</span>
                                                    <span className="text-blue-500">P: {dailyTotals.totalProtein.toFixed(1)}g</span>
                                                    <span className="text-green-500">C: {dailyTotals.totalCarbs.toFixed(1)}g</span>
                                                    <span className="text-yellow-500">F: {dailyTotals.totalFat.toFixed(1)}g</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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

            {
                selectedFood && (
                    <FoodUnitSelector
                        food={selectedFood}
                        open={isFoodUnitSelectorOpen}
                        onOpenChange={setIsFoodUnitSelectorOpen}
                        onSelect={handleFoodUnitSelected}
                    />
                )
            }

            {
                selectedMeal && (
                    <MealUnitSelector
                        meal={selectedMeal}
                        open={isMealUnitSelectorOpen}
                        onOpenChange={setIsMealUnitSelectorOpen}
                        onSelect={handleMealUnitSelected}
                    />
                )
            }
        </>
    );
};

export default MealPlanTemplateForm;