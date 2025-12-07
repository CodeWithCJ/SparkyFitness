import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Target } from "lucide-react";
import { apiCall } from '@/services/api';
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@/contexts/PreferencesContext"; // Added import
import { useIsMobile } from "@/hooks/use-mobile";
import { saveGoals as saveGoalsService } from '@/services/goalsService';
import { GoalPreset, createGoalPreset, getGoalPresets, updateGoalPreset, deleteGoalPreset } from '@/services/goalPresetService';
import { WeeklyGoalPlan, createWeeklyGoalPlan, getWeeklyGoalPlans, updateWeeklyGoalPlan, deleteWeeklyGoalPlan } from '@/services/weeklyGoalPlanService';
import { PlusCircle, Edit, Trash2, CalendarDays, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MealPercentageManager from './MealPercentageManager';
import { Separator } from "@/components/ui/separator";
import { resetOnboardingStatus } from "@/services/onboardingService";

import { ExpandedGoals } from '@/types/goals';
import { DEFAULT_GOALS } from '@/constants/goals';

const GoalsSettings = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { dateFormat, formatDateInUserTimezone, parseDateInUserTimezone, nutrientDisplayPreferences, water_display_unit, setWaterDisplayUnit, energyUnit, convertEnergy, getEnergyUnitString } = usePreferences(); // Corrected destructuring

  // Helper functions for unit conversion
  const convertMlToSelectedUnit = (ml: number, unit: 'ml' | 'oz' | 'liter'): number => {
    switch (unit) {
      case 'oz':
        return ml / 29.5735;
      case 'liter':
        return ml / 1000;
      case 'ml':
      default:
        return ml;
    }
  };

  const convertSelectedUnitToMl = (value: number, unit: 'ml' | 'oz' | 'liter'): number => {
    switch (unit) {
      case 'oz':
        return value * 29.5735;
      case 'liter':
        return value * 1000;
      case 'ml':
      default:
        return value;
    }
  };



  const [goals, setGoals] = useState<ExpandedGoals>(DEFAULT_GOALS); // Initialize with DEFAULT_GOALS
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // State for Goal Presets
  const [goalPresets, setGoalPresets] = useState<GoalPreset[]>([]);
  const [isPresetDialogOpen, setIsPresetDialogOpen] = useState(false);
  const [currentPreset, setCurrentPreset] = useState<GoalPreset | null>(null);
  const [presetMacroInputType, setPresetMacroInputType] = useState<'grams' | 'percentages'>('grams');
  const [presetSaving, setPresetSaving] = useState(false);

  // State for Weekly Goal Plans
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyGoalPlan[]>([]);
  const [isWeeklyPlanDialogOpen, setIsWeeklyPlanDialogOpen] = useState(false);
  const [currentWeeklyPlan, setCurrentWeeklyPlan] = useState<WeeklyGoalPlan | null>(null);
  const [weeklyPlanSaving, setWeeklyPlanSaving] = useState(false);

  useEffect(() => {
    if (user) {
      loadGoals();
      loadGoalPresets();
      loadWeeklyPlans();
    }
  }, [user]);

  const loadGoals = async () => {
    try {
      setLoading(true);

      const today = new Date().toISOString().split('T')[0];

      const data = await apiCall(`/goals/for-date?date=${today}`, {
        method: 'GET',
      });

      if (data) {
        // The API now returns the correct goal, including defaults if none are found.
        // So we can directly set the goals from the API response.
        setGoals(data); // data.calories is in kcal
      } else {
        // Fallback to default goals if API returns nothing (shouldn't happen with current backend logic)
        setGoals(DEFAULT_GOALS);
      }
    } catch (error) {
      console.error('Error loading goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGoalPresets = async () => {
    try {
      const presets = await getGoalPresets();
      setGoalPresets(presets);
    } catch (error) {
      console.error('Error loading goal presets:', error);
      toast({
        title: t('goals.goalsSettings.error', 'Error'),
        description: t('goals.goalsSettings.errorLoadingGoalPresets', 'Failed to load goal presets.'),
        variant: "destructive",
      });
    }
  };

  const handleCreatePresetClick = () => {
    const presetName = `Preset ${new Date().toLocaleString()}`;
    setCurrentPreset({
      ...goals, // Start with today's goals
      preset_name: presetName,
      id: undefined, // Ensure it's treated as a new preset
    });
    setPresetMacroInputType('grams');
    setIsPresetDialogOpen(true);
  };

  const handleEditPresetClick = (preset: GoalPreset) => {
    setCurrentPreset({ ...preset });
    // Determine macro input type based on whether percentages are set
    if (preset.protein_percentage !== null && preset.carbs_percentage !== null && preset.fat_percentage !== null) {
      setPresetMacroInputType('percentages');
    } else {
      setPresetMacroInputType('grams');
    }
    setIsPresetDialogOpen(true);
  };

  const handleSavePreset = async () => {
    if (!currentPreset || !user) return;

    setPresetSaving(true);
    try {
      let presetToSave = { ...currentPreset };

      // If percentages are being used, ensure gram values are calculated before saving
      if (presetMacroInputType === 'percentages' && presetToSave.protein_percentage !== null && presetToSave.carbs_percentage !== null && presetToSave.fat_percentage !== null) {
        // presetToSave.calories is already in kcal
        const protein_grams = presetToSave.calories * (presetToSave.protein_percentage / 100) / 4;
        const carbs_grams = presetToSave.calories * (presetToSave.carbs_percentage / 100) / 4;
        const fat_grams = presetToSave.calories * (presetToSave.fat_percentage / 100) / 9;
        presetToSave = { ...presetToSave, protein: protein_grams, carbs: carbs_grams, fat: fat_grams };
      } else {
        // If grams are being used, clear percentage fields
        presetToSave = { ...presetToSave, protein_percentage: null, carbs_percentage: null, fat_percentage: null };
      }

      if (currentPreset.id) {
        await updateGoalPreset(currentPreset.id, presetToSave);
        toast({ title: t('goals.goalsSettings.success', 'Success'), description: t('goals.goalsSettings.presetUpdatedSuccess', 'Goal preset updated successfully.') });
      } else {
        await createGoalPreset(presetToSave);
        toast({ title: t('goals.goalsSettings.success', 'Success'), description: t('goals.goalsSettings.presetCreatedSuccess', 'Goal preset created successfully.') });
      }
      setIsPresetDialogOpen(false);
      loadGoalPresets(); // Refresh the list
    } catch (error) {
      console.error('Error saving preset:', error);
      toast({
        title: t('goals.goalsSettings.error', 'Error'),
        description: t('goals.goalsSettings.errorSavingPreset', 'Failed to save goal preset.'),
        variant: "destructive",
      });
    } finally {
      setPresetSaving(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm(t('goals.goalsSettings.deletePresetConfirm', 'Are you sure you want to delete this preset?'))) return;
    try {
      await deleteGoalPreset(presetId);
      toast({ title: t('goals.goalsSettings.success', 'Success'), description: t('goals.goalsSettings.presetDeletedSuccess', 'Goal preset deleted successfully.') });
      loadGoalPresets();
    } catch (error) {
      console.error('Error deleting preset:', error);
      toast({
        title: t('goals.goalsSettings.error', 'Error'),
        description: t('goals.goalsSettings.errorDeletingPreset', 'Failed to delete goal preset.'),
        variant: "destructive",
      });
    }
  };

  const calculateMacroGrams = (calories: number, percentage: number) => { // calories here are in kcal
    // Protein and Carbs: 4 kcal/g, Fat: 9 kcal/g
    if (percentage === null) return 0;
    // This logic needs to be improved to correctly identify which macro is being calculated
    // For now, assuming it's for each macro type individually
    // For a generic calculation, we need to know the macro type
    // As a placeholder, let's assume it's for protein/carbs (4 kcal/g)
    return (calories * (percentage / 100)) / 4;
  };

  const calculateMacroPercentage = (calories: number, grams: number, macroType: 'protein' | 'carbs' | 'fat') => { // calories here are in kcal
    if (calories === 0) return 0;
    if (macroType === 'protein' || macroType === 'carbs') {
      return (grams * 4 / calories) * 100;
    } else if (macroType === 'fat') {
      return (grams * 9 / calories) * 100;
    }
    return 0; // Default return for unmatched macroType
  };

  // Weekly Plan Functions
  const loadWeeklyPlans = async () => {
    try {
      const plans = await getWeeklyGoalPlans();
      setWeeklyPlans(plans);
    } catch (error) {
      console.error('Error loading weekly plans:', error);
      toast({
        title: t('goals.goalsSettings.error', 'Error'),
        description: t('goals.goalsSettings.errorLoadingWeeklyPlans', 'Failed to load weekly plans.'),
        variant: "destructive",
      });
    }
  };

  const handleCreateWeeklyPlanClick = () => {
    setCurrentWeeklyPlan({
      plan_name: '',
      start_date: formatDateInUserTimezone(new Date(), 'yyyy-MM-dd'), // Changed
      end_date: null,
      is_active: true,
      monday_preset_id: null,
      tuesday_preset_id: null,
      wednesday_preset_id: null,
      thursday_preset_id: null,
      friday_preset_id: null,
      saturday_preset_id: null,
      sunday_preset_id: null,
    });
    setIsWeeklyPlanDialogOpen(true);
  };

  const handleEditWeeklyPlanClick = (plan: WeeklyGoalPlan) => {
    setCurrentWeeklyPlan({ ...plan });
    setIsWeeklyPlanDialogOpen(true);
  };

  const handleSaveWeeklyPlan = async () => {
    if (!currentWeeklyPlan || !user) return;

    setWeeklyPlanSaving(true);
    try {
      if (currentWeeklyPlan.id) {
        await updateWeeklyGoalPlan(currentWeeklyPlan.id, currentWeeklyPlan);
        toast({ title: t('goals.goalsSettings.success', 'Success'), description: t('goals.goalsSettings.weeklyPlanUpdatedSuccess', 'Weekly plan updated successfully.') });
      } else {
        await createWeeklyGoalPlan(currentWeeklyPlan);
        toast({ title: t('goals.goalsSettings.success', 'Success'), description: t('goals.goalsSettings.weeklyPlanCreatedSuccess', 'Weekly plan created successfully.') });
      }
      setIsWeeklyPlanDialogOpen(false);
      loadWeeklyPlans(); // Refresh the list
    } catch (error) {
      console.error('Error saving weekly plan:', error);
      toast({
        title: t('goals.goalsSettings.error', 'Error'),
        description: t('goals.goalsSettings.errorSavingWeeklyPlan', 'Failed to save weekly plan.'),
        variant: "destructive",
      });
    } finally {
      setWeeklyPlanSaving(false);
    }
  };

  const handleDeleteWeeklyPlan = async (planId: string) => {
    if (!confirm(t('goals.goalsSettings.deleteWeeklyPlanConfirm', 'Are you sure you want to delete this weekly plan?'))) return;
    try {
      await deleteWeeklyGoalPlan(planId);
      toast({ title: t('goals.goalsSettings.success', 'Success'), description: t('goals.goalsSettings.weeklyPlanDeletedSuccess', 'Weekly plan deleted successfully.') });
      loadWeeklyPlans();
    } catch (error) {
      console.error('Error deleting weekly plan:', error);
      toast({
        title: t('goals.goalsSettings.error', 'Error'),
        description: t('goals.goalsSettings.errorDeletingWeeklyPlan', 'Failed to delete weekly plan.'),
        variant: "destructive",
      });
    }
  };

  const handleSaveGoals = async () => {
    if (!user) return;

    try {
      setSaving(true);

      const today = new Date().toISOString().split('T')[0];

      console.log("GoalsSettings: Saving goals with payload:", goals); // Re-enable logging
      await saveGoalsService(today, goals, true);

      toast({
        title: t('goals.goalsSettings.success', 'Success'),
        description: t('goals.goalsSettings.goalsUpdatedSuccess', 'Goals updated and will apply for the next 6 months (or until your next future goal)'),
      });

      await loadGoals();
    } catch (error) {
      console.error('Error saving goals:', error);
      toast({
        title: t('goals.goalsSettings.error', 'Error'),
        description: t('goals.goalsSettings.errorSavingGoals', 'An unexpected error occurred while saving goals'),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetOnboarding = async () => {
    if (!confirm(t('goals.goalsSettings.resetOnboardingConfirm', 'Are you sure you want to reset your onboarding status? This will restart the onboarding process.'))) {
      return;
    }
    setSaving(true);
    try {
      await resetOnboardingStatus();
      toast({
        title: t('goals.goalsSettings.success', 'Success'),
        description: t('goals.goalsSettings.resetOnboardingSuccess', 'Onboarding status has been reset. The page will now reload.'),
      });
      window.location.reload();
    } catch (error: any) {
      console.error('Error resetting onboarding status:', error);
      toast({
        title: t('goals.goalsSettings.error', 'Error'),
        description: `${t('goals.goalsSettings.errorResettingOnboarding', 'Failed to reset onboarding status:')} ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const goalPreferences = nutrientDisplayPreferences.find(p => p.view_group === 'goal' && p.platform === platform);
  const visibleNutrients = goalPreferences ? goalPreferences.visible_nutrients : Object.keys(goals);

  if (!user) {
    return <div>{t('goals.goalsSettings.pleaseSignIn', 'Please sign in to manage your goals.')}</div>;
  }

  if (loading) {
    return <div>{t('goals.goalsSettings.loadingGoals', 'Loading goals...')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('goals.goalsSettings.title', 'Goals Settings')}</h2>
        <Badge variant="outline" className="text-lg px-3 py-1">
          <Target className="w-4 h-4 mr-2" />
          {t('goals.goalsSettings.cascadingGoals', 'Cascading Goals')}
        </Badge>
      </div>

      {/* Reset Onboarding */}
      <Card>
        <CardHeader>
          <CardTitle>{t('goals.goalsSettings.resetOnboarding', 'Reset Onboarding')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {t('goals.goalsSettings.resetOnboardingDescription', 'Reset your onboarding status to revisit the initial questionnaire. You will be signed out after resetting.')}
          </p>
          <Button
            onClick={handleResetOnboarding}
            disabled={saving}
            variant="destructive"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {t('goals.goalsSettings.resetOnboarding', 'Reset Onboarding')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            {t('goals.goalsSettings.dailyNutritionGoals', 'Daily Nutrition Goals')}
            <div className="text-sm font-normal text-gray-600 ml-2">
              {t('goals.goalsSettings.changesCascadeInfo', '(Changes cascade for 6 months from today or until your next future goal)')}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Primary Macros */}
            {visibleNutrients.includes('calories') && <div>
              <Label htmlFor="calories">{t('goals.goalsSettings.calories', `Calories (${getEnergyUnitString(energyUnit)})`)}</Label>
              <Input
                id="calories"
                type="number"
                value={Math.round(convertEnergy(goals.calories, 'kcal', energyUnit))}
                onChange={(e) => setGoals({ ...goals, calories: convertEnergy(Number(e.target.value), energyUnit, 'kcal') })}
              />
            </div>}

            {visibleNutrients.includes('protein') && <div>
              <Label htmlFor="protein">{t('goals.goalsSettings.protein', 'Protein (g)')}</Label>
              <Input
                id="protein"
                type="number"
                value={goals.protein}
                onChange={(e) => setGoals({ ...goals, protein: Number(e.target.value) })}
              />
            </div>}

            {visibleNutrients.includes('carbs') && <div>
              <Label htmlFor="carbs">{t('goals.goalsSettings.carbohydrates', 'Carbohydrates (g)')}</Label>
              <Input
                id="carbs"
                type="number"
                value={goals.carbs}
                onChange={(e) => setGoals({ ...goals, carbs: Number(e.target.value) })}
              />
            </div>}

            {visibleNutrients.includes('fat') && <div>
              <Label htmlFor="fat">{t('goals.goalsSettings.fat', 'Fat (g)')}</Label>
              <Input
                id="fat"
                type="number"
                value={goals.fat}
                onChange={(e) => setGoals({ ...goals, fat: Number(e.target.value) })}
              />
            </div>}

            {/* Fat Types */}
            {visibleNutrients.includes('saturated_fat') && <div>
              <Label htmlFor="saturated_fat">{t('goals.goalsSettings.saturatedFat', 'Saturated Fat (g)')}</Label>
              <Input
                id="saturated_fat"
                type="number"
                value={goals.saturated_fat}
                onChange={(e) => setGoals({ ...goals, saturated_fat: Number(e.target.value) })}
              />
            </div>}

            {visibleNutrients.includes('polyunsaturated_fat') && <div>
              <Label htmlFor="polyunsaturated_fat">{t('goals.goalsSettings.polyunsaturatedFat', 'Polyunsaturated Fat (g)')}</Label>
              <Input
                id="polyunsaturated_fat"
                type="number"
                value={goals.polyunsaturated_fat}
                onChange={(e) => setGoals({ ...goals, polyunsaturated_fat: Number(e.target.value) })}
              />
            </div>}

            {visibleNutrients.includes('monounsaturated_fat') && <div>
              <Label htmlFor="monounsaturated_fat">{t('goals.goalsSettings.monounsaturatedFat', 'Monounsaturated Fat (g)')}</Label>
              <Input
                id="monounsaturated_fat"
                type="number"
                value={goals.monounsaturated_fat}
                onChange={(e) => setGoals({ ...goals, monounsaturated_fat: Number(e.target.value) })}
              />
            </div>}

            {visibleNutrients.includes('trans_fat') && <div>
              <Label htmlFor="trans_fat">{t('goals.goalsSettings.transFat', 'Trans Fat (g)')}</Label>
              <Input
                id="trans_fat"
                type="number"
                value={goals.trans_fat}
                onChange={(e) => setGoals({ ...goals, trans_fat: Number(e.target.value) })}
              />
            </div>}

            {/* Other Nutrients */}
            {visibleNutrients.includes('cholesterol') && <div>
              <Label htmlFor="cholesterol">{t('goals.goalsSettings.cholesterol', 'Cholesterol (mg)')}</Label>
              <Input
                id="cholesterol"
                type="number"
                value={goals.cholesterol}
                onChange={(e) => setGoals({ ...goals, cholesterol: Number(e.target.value) })}
              />
            </div>}
            {visibleNutrients.includes('sodium') && <div>
              <Label htmlFor="sodium">{t('goals.goalsSettings.sodium', 'Sodium (mg)')}</Label>
              <Input
                id="sodium"
                type="number"
                value={goals.sodium}
                onChange={(e) => setGoals({ ...goals, sodium: Number(e.target.value) })}
              />
            </div>}
            {visibleNutrients.includes('potassium') && <div>
              <Label htmlFor="potassium">{t('goals.goalsSettings.potassium', 'Potassium (mg)')}</Label>
              <Input
                id="potassium"
                type="number"
                value={goals.potassium}
                onChange={(e) => setGoals({ ...goals, potassium: Number(e.target.value) })}
              />
            </div>}
            {visibleNutrients.includes('dietary_fiber') && <div>
              <Label htmlFor="dietary_fiber">{t('goals.goalsSettings.dietaryFiber', 'Dietary Fiber (g)')}</Label>
              <Input
                id="dietary_fiber"
                type="number"
                value={goals.dietary_fiber}
                onChange={(e) => setGoals({ ...goals, dietary_fiber: Number(e.target.value) })}
              />
            </div>}
            {visibleNutrients.includes('sugars') && <div>
              <Label htmlFor="sugars">{t('goals.goalsSettings.sugars', 'Sugars (g)')}</Label>
              <Input
                id="sugars"
                type="number"
                value={goals.sugars}
                onChange={(e) => setGoals({ ...goals, sugars: Number(e.target.value) })}
              />
            </div>}
            {/* Vitamins and Minerals */}
            {visibleNutrients.includes('vitamin_a') && <div>
              <Label htmlFor="vitamin_a">{t('goals.goalsSettings.vitaminA', 'Vitamin A (mcg)')}</Label>
              <Input
                id="vitamin_a"
                type="number"
                value={goals.vitamin_a}
                onChange={(e) => setGoals({ ...goals, vitamin_a: Number(e.target.value) })}
              />
            </div>}
            {visibleNutrients.includes('vitamin_c') && <div>
              <Label htmlFor="vitamin_c">{t('goals.goalsSettings.vitaminC', 'Vitamin C (mg)')}</Label>
              <Input
                id="vitamin_c"
                type="number"
                value={goals.vitamin_c}
                onChange={(e) => setGoals({ ...goals, vitamin_c: Number(e.target.value) })}
              />
            </div>}
            {visibleNutrients.includes('calcium') && <div>
              <Label htmlFor="calcium">{t('goals.goalsSettings.calcium', 'Calcium (mg)')}</Label>
              <Input
                id="calcium"
                type="number"
                value={goals.calcium}
                onChange={(e) => setGoals({ ...goals, calcium: Number(e.target.value) })}
              />
            </div>}
            {visibleNutrients.includes('iron') && <div>
              <Label htmlFor="iron">{t('goals.goalsSettings.iron', 'Iron (mg)')}</Label>
              <Input
                id="iron"
                type="number"
                value={goals.iron}
                onChange={(e) => setGoals({ ...goals, iron: Number(e.target.value) })}
              />
            </div>}

            <div>
              <Label htmlFor="water">{t('goals.goalsSettings.waterGoal', { unit: water_display_unit, defaultValue: 'Water Goal ({{unit}})' })}</Label>
              <Input
                id="water"
                type="number"
                value={convertMlToSelectedUnit(goals.water_goal_ml, water_display_unit)}
                onChange={(e) => setGoals({ ...goals, water_goal_ml: convertSelectedUnitToMl(Number(e.target.value), water_display_unit) })}
              />
              <Select
                value={water_display_unit}
                onValueChange={(value: 'ml' | 'oz' | 'liter') => setWaterDisplayUnit(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="oz">oz</SelectItem>
                  <SelectItem value="liter">liter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Exercise Goals */}
            <div>
              <Label htmlFor="target_exercise_calories_burned">{t('goals.goalsSettings.targetExerciseCaloriesBurned', 'Target Exercise Calories Burned')}</Label>
              <Input
                id="target_exercise_calories_burned"
                type="number"
                value={goals.target_exercise_calories_burned}
                onChange={(e) => setGoals({ ...goals, target_exercise_calories_burned: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="target_exercise_duration_minutes">{t('goals.goalsSettings.targetExerciseDurationMinutes', 'Target Exercise Duration (minutes)')}</Label>
              <Input
                id="target_exercise_duration_minutes"
                type="number"
                value={goals.target_exercise_duration_minutes}
                onChange={(e) => setGoals({ ...goals, target_exercise_duration_minutes: Number(e.target.value) })}
              />
            </div>
          </div>

          <Separator className="my-6" />

          <h3 className="text-lg font-semibold mb-4">{t('goals.goalsSettings.mealCalorieDistribution', 'Meal Calorie Distribution')}</h3>
          <MealPercentageManager
            initialPercentages={{
              breakfast: goals.breakfast_percentage,
              lunch: goals.lunch_percentage,
              dinner: goals.dinner_percentage,
              snacks: goals.snacks_percentage,
            }}
            totalCalories={goals.calories}
            onPercentagesChange={(newPercentages) => {
              setGoals(prevGoals => ({
                ...prevGoals,
                breakfast_percentage: newPercentages.breakfast,
                lunch_percentage: newPercentages.lunch,
                dinner_percentage: newPercentages.dinner,
                snacks_percentage: newPercentages.snacks,
              }));
            }}
          />

          <div className="mt-6">
            <Button
              onClick={handleSaveGoals}
              className="w-full"
              disabled={saving || (goals.breakfast_percentage + goals.lunch_percentage + goals.dinner_percentage + goals.snacks_percentage) !== 100}
            >
              {saving ? t('goals.goalsSettings.saving', 'Saving...') : t('goals.goalsSettings.saveGoals', 'Save Goals')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Goal Presets Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">{t('goals.goalsSettings.goalPresets', 'Goal Presets')}</CardTitle>
          <Button size="sm" onClick={handleCreatePresetClick}>
            <PlusCircle className="w-4 h-4 mr-2" /> {t('goals.goalsSettings.createNewPreset', 'Create New Preset')}
          </Button>
        </CardHeader>
        <CardContent>
          {goalPresets.length === 0 ? (
            <p className="text-gray-500">{t('goals.goalsSettings.noGoalPresets', 'No goal presets defined yet. Create one to get started!')}</p>
          ) : (
            <div className="space-y-4">
              {goalPresets.map((preset) => (
                <div key={preset.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <h4 className="font-semibold">{preset.preset_name}</h4>
                    <p className="text-sm text-gray-600">
                      {t('goals.goalsSettings.presetKcalMacros', { calories: Math.round(convertEnergy(preset.calories, 'kcal', energyUnit)), protein: Number(preset.protein || 0).toFixed(0), carbs: Number(preset.carbs || 0).toFixed(0), fat: Number(preset.fat || 0).toFixed(0), energyUnit: getEnergyUnitString(energyUnit), defaultValue: '{{calories}} {{energyUnit}}, {{protein}}g P, {{carbs}}g C, {{fat}}g F' })}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditPresetClick(preset)}>
                      <Edit className="w-4 h-4" /> {t('goals.goalsSettings.edit', 'Edit')}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeletePreset(preset.id!)}>
                      <Trash2 className="w-4 h-4" /> {t('goals.goalsSettings.delete', 'Delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goal Preset Dialog */}
      <Dialog open={isPresetDialogOpen} onOpenChange={setIsPresetDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{currentPreset?.id ? t('goals.goalsSettings.editGoalPreset', 'Edit Goal Preset') : t('goals.goalsSettings.createNewGoalPreset', 'Create New Goal Preset')}</DialogTitle>
            <DialogDescription>{t('goals.goalsSettings.defineReusableGoals', 'Define a reusable set of nutrition and exercise goals.')}</DialogDescription>
          </DialogHeader>
          {currentPreset && (
            <div className="space-y-6 py-4">
              {/* Preset Name */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="preset_name" className="text-right">
                  {t('goals.goalsSettings.presetName', 'Preset Name')}
                </Label>
                <Input
                  id="preset_name"
                  value={currentPreset.preset_name}
                  onChange={(e) => setCurrentPreset({ ...currentPreset, preset_name: e.target.value })}
                  className="col-span-3"
                />
              </div>

              {/* Main Nutrients Section */}
              <h3 className="text-lg font-semibold col-span-full">{t('goals.goalsSettings.mainNutrients', 'Main Nutrients')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Calories */}
                <div>
                  <Label htmlFor="calories">{t('goals.goalsSettings.calories', `Calories (${getEnergyUnitString(energyUnit)})`)}</Label>
                  <Input
                    id="calories"
                    type="number"
                    value={Math.round(convertEnergy(currentPreset.calories, 'kcal', energyUnit))}
                    onChange={(e) => setCurrentPreset({ ...currentPreset, calories: convertEnergy(Number(e.target.value), energyUnit, 'kcal') })}
                  />
                </div>

                {/* Macro Input Type Toggle */}
                <div className="col-span-full flex items-center gap-4">
                  <Label className="text-right">{t('goals.goalsSettings.macrosBy', 'Macros By')}</Label>
                  <RadioGroup
                    value={presetMacroInputType}
                    onValueChange={(value: 'grams' | 'percentages') => setPresetMacroInputType(value)}
                    className="flex items-center space-x-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="grams" id="macro-grams" />
                      <Label htmlFor="macro-grams">{t('goals.goalsSettings.grams', 'Grams')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="percentages" id="macro-percentages" />
                      <Label htmlFor="macro-percentages">{t('goals.goalsSettings.percentages', 'Percentages')}</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Protein */}
                <div>
                  <Label htmlFor="protein">
                    {presetMacroInputType === 'grams' ? t('goals.goalsSettings.protein', 'Protein (g)') : t('goals.goalsSettings.proteinPercentage', 'Protein (%)')}
                  </Label>
                  <Input
                    id="protein"
                    type="number"
                    value={presetMacroInputType === 'grams' ? currentPreset.protein : (currentPreset.protein_percentage ?? '')}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (presetMacroInputType === 'grams') {
                        setCurrentPreset({ ...currentPreset, protein: value });
                      } else {
                        setCurrentPreset({ ...currentPreset, protein_percentage: value, protein: calculateMacroGrams(currentPreset.calories, value) });
                      }
                    }}
                  />
                </div>

                {/* Carbs */}
                <div>
                  <Label htmlFor="carbs">
                    {presetMacroInputType === 'grams' ? t('goals.goalsSettings.carbohydrates', 'Carbohydrates (g)') : t('goals.goalsSettings.carbsPercentage', 'Carbs (%)')}
                  </Label>
                  <Input
                    id="carbs"
                    type="number"
                    value={presetMacroInputType === 'grams' ? currentPreset.carbs : (currentPreset.carbs_percentage ?? '')}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (presetMacroInputType === 'grams') {
                        setCurrentPreset({ ...currentPreset, carbs: value });
                      } else {
                        setCurrentPreset({ ...currentPreset, carbs_percentage: value, carbs: calculateMacroGrams(currentPreset.calories, value) });
                      }
                    }}
                  />
                </div>

                {/* Fat */}
                <div>
                  <Label htmlFor="fat">
                    {presetMacroInputType === 'grams' ? t('goals.goalsSettings.fat', 'Fat (g)') : t('goals.goalsSettings.fatPercentage', 'Fat (%)')}
                  </Label>
                  <Input
                    id="fat"
                    type="number"
                    value={presetMacroInputType === 'grams' ? currentPreset.fat : (currentPreset.fat_percentage ?? '')}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (presetMacroInputType === 'grams') {
                        setCurrentPreset({ ...currentPreset, fat: value });
                      } else {
                        setCurrentPreset({ ...currentPreset, fat_percentage: value, fat: calculateMacroGrams(currentPreset.calories, value) });
                      }
                    }}
                  />
                </div>

                {/* Calculated Grams */}
                <div className="col-span-full text-center text-sm text-gray-500">
                  {presetMacroInputType === 'percentages' && (
                    t('goals.goalsSettings.calculatedGrams', {
                      protein: Number(calculateMacroGrams(currentPreset.calories, currentPreset.protein_percentage || 0)).toFixed(0),
                      carbs: Number(calculateMacroGrams(currentPreset.calories, currentPreset.carbs_percentage || 0)).toFixed(0),
                      fat: Number(calculateMacroGrams(currentPreset.calories, currentPreset.fat_percentage || 0)).toFixed(0),
                      defaultValue: 'Calculated Grams: Protein {{protein}}g, Carbs {{carbs}}g, Fat {{fat}}g'
                    })
                  )}
                </div>
              </div>

              {/* Fat Breakdown Section */}
              <h3 className="text-lg font-semibold col-span-full mt-4">{t('goals.goalsSettings.fatBreakdown', 'Fat Breakdown')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="saturated_fat">{t('goals.goalsSettings.satFat', 'Sat Fat (g)')}</Label>
                  <Input id="saturated_fat" type="number" value={currentPreset.saturated_fat} onChange={(e) => setCurrentPreset({ ...currentPreset, saturated_fat: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="polyunsaturated_fat">{t('goals.goalsSettings.polyFat', 'Poly Fat (g)')}</Label>
                  <Input id="polyunsaturated_fat" type="number" value={currentPreset.polyunsaturated_fat} onChange={(e) => setCurrentPreset({ ...currentPreset, polyunsaturated_fat: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="monounsaturated_fat">{t('goals.goalsSettings.monoFat', 'Mono Fat (g)')}</Label>
                  <Input id="monounsaturated_fat" type="number" value={currentPreset.monounsaturated_fat} onChange={(e) => setCurrentPreset({ ...currentPreset, monounsaturated_fat: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="trans_fat">{t('goals.goalsSettings.transFat', 'Trans Fat (g)')}</Label>
                  <Input id="trans_fat" type="number" value={currentPreset.trans_fat} onChange={(e) => setCurrentPreset({ ...currentPreset, trans_fat: Number(e.target.value) })} />
                </div>
              </div>

              {/* Minerals & Other Section */}
              <h3 className="text-lg font-semibold col-span-full mt-4">{t('goals.goalsSettings.mineralsOther', 'Minerals & Other')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="cholesterol">{t('goals.goalsSettings.cholesterol', 'Cholesterol (mg)')}</Label>
                  <Input id="cholesterol" type="number" value={currentPreset.cholesterol} onChange={(e) => setCurrentPreset({ ...currentPreset, cholesterol: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="sodium">{t('goals.goalsSettings.sodium', 'Sodium (mg)')}</Label>
                  <Input id="sodium" type="number" value={currentPreset.sodium} onChange={(e) => setCurrentPreset({ ...currentPreset, sodium: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="potassium">{t('goals.goalsSettings.potassium', 'Potassium (mg)')}</Label>
                  <Input id="potassium" type="number" value={currentPreset.potassium} onChange={(e) => setCurrentPreset({ ...currentPreset, potassium: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="dietary_fiber">{t('goals.goalsSettings.fiber', 'Fiber (g)')}</Label>
                  <Input id="dietary_fiber" type="number" value={currentPreset.dietary_fiber} onChange={(e) => setCurrentPreset({ ...currentPreset, dietary_fiber: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="sugars">{t('goals.goalsSettings.sugars', 'Sugars (g)')}</Label>
                  <Input id="sugars" type="number" value={currentPreset.sugars} onChange={(e) => setCurrentPreset({ ...currentPreset, sugars: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="vitamin_a">{t('goals.goalsSettings.vitaminA', 'Vitamin A (mcg)')}</Label>
                  <Input id="vitamin_a" type="number" value={currentPreset.vitamin_a} onChange={(e) => setCurrentPreset({ ...currentPreset, vitamin_a: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="vitamin_c">{t('goals.goalsSettings.vitaminC', 'Vitamin C (mg)')}</Label>
                  <Input id="vitamin_c" type="number" value={currentPreset.vitamin_c} onChange={(e) => setCurrentPreset({ ...currentPreset, vitamin_c: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="calcium">{t('goals.goalsSettings.calcium', 'Calcium (mg)')}</Label>
                  <Input id="calcium" type="number" value={currentPreset.calcium} onChange={(e) => setCurrentPreset({ ...currentPreset, calcium: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="iron">{t('goals.goalsSettings.iron', 'Iron (mg)')}</Label>
                  <Input id="iron" type="number" value={currentPreset.iron} onChange={(e) => setCurrentPreset({ ...currentPreset, iron: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="water_goal_ml">{t('goals.goalsSettings.waterGoal', { unit: water_display_unit, defaultValue: 'Water Goal ({{unit}})' })}</Label>
                  <Input
                    id="water_goal_ml"
                    type="number"
                    value={convertMlToSelectedUnit(currentPreset.water_goal_ml, water_display_unit)}
                    onChange={(e) => setCurrentPreset({ ...currentPreset, water_goal_ml: convertSelectedUnitToMl(Number(e.target.value), water_display_unit) })}
                  />
                  <Select
                    value={water_display_unit}
                    onValueChange={(value: 'ml' | 'oz' | 'liter') => setWaterDisplayUnit(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                      <SelectItem value="liter">liter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Exercise Section */}
              <h3 className="text-lg font-semibold col-span-full mt-4">{t('goals.goalsSettings.exercise', 'Exercise')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="target_exercise_calories_burned">{t('goals.goalsSettings.exerciseCalories', `Exercise Calories (${getEnergyUnitString(energyUnit)})`)}</Label>
                  <Input id="target_exercise_calories_burned" type="number" value={Math.round(convertEnergy(currentPreset.target_exercise_calories_burned, 'kcal', energyUnit))} onChange={(e) => setCurrentPreset({ ...currentPreset, target_exercise_calories_burned: convertEnergy(Number(e.target.value), energyUnit, 'kcal') })} />
                </div>
                <div>
                  <Label htmlFor="target_exercise_duration_minutes">{t('goals.goalsSettings.exerciseDuration', 'Ex. Duration (min)')}</Label>
                  <Input id="target_exercise_duration_minutes" type="number" value={currentPreset.target_exercise_duration_minutes} onChange={(e) => setCurrentPreset({ ...currentPreset, target_exercise_duration_minutes: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}
          {currentPreset && (
            <>
              <Separator className="my-6" />
              <h3 className="text-lg font-semibold col-span-full mt-4">{t('goals.goalsSettings.mealCalorieDistribution', 'Meal Calorie Distribution')}</h3>
              <MealPercentageManager
                initialPercentages={{
                  breakfast: currentPreset.breakfast_percentage,
                  lunch: currentPreset.lunch_percentage,
                  dinner: currentPreset.dinner_percentage,
                  snacks: currentPreset.snacks_percentage,
                }}
                totalCalories={currentPreset.calories} // Add this line
                onPercentagesChange={(newPercentages) => {
                  setCurrentPreset(prevPreset => prevPreset ? ({
                    ...prevPreset,
                    breakfast_percentage: newPercentages.breakfast,
                    lunch_percentage: newPercentages.lunch,
                    dinner_percentage: newPercentages.dinner,
                    snacks_percentage: newPercentages.snacks,
                  }) : null);
                }}
              />
              <DialogFooter>
                <Button onClick={handleSavePreset} disabled={presetSaving || (currentPreset.breakfast_percentage + currentPreset.lunch_percentage + currentPreset.dinner_percentage + currentPreset.snacks_percentage) !== 100}>
                  {presetSaving ? t('goals.goalsSettings.saving', 'Saving...') : t('goals.goalsSettings.savePreset', 'Save Preset')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Weekly Goal Plans Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">{t('goals.goalsSettings.weeklyGoalPlans', 'Weekly Goal Plans (WIP)')}</CardTitle>
          <Button size="sm" onClick={handleCreateWeeklyPlanClick}>
            <PlusCircle className="w-4 h-4 mr-2" /> {t('goals.goalsSettings.createNewPlan', 'Create New Plan')}
          </Button>
        </CardHeader>
        <CardContent>
          {weeklyPlans.length === 0 ? (
            <p className="text-gray-500">{t('goals.goalsSettings.noWeeklyPlans', 'No weekly goal plans defined yet. Create one to automate your goals!')}</p>
          ) : (
            <div className="space-y-4">
              {weeklyPlans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <h4 className="font-semibold">{plan.plan_name} {plan.is_active && <Badge variant="secondary">{t('goals.goalsSettings.active', 'Active')}</Badge>}</h4>
                    <p className="text-sm text-gray-600">
                      {formatDateInUserTimezone(plan.start_date)} to {plan.end_date ? formatDateInUserTimezone(plan.end_date) : t('common.indefinite', 'Indefinite')}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditWeeklyPlanClick(plan)}>
                      <Edit className="w-4 h-4" /> {t('goals.goalsSettings.edit', 'Edit')}
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteWeeklyPlan(plan.id!)}>
                      <Trash2 className="w-4 h-4" /> {t('goals.goalsSettings.delete', 'Delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly Goal Plan Dialog */}
      <Dialog open={isWeeklyPlanDialogOpen} onOpenChange={setIsWeeklyPlanDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{currentWeeklyPlan?.id ? t('goals.goalsSettings.editWeeklyGoalPlan', 'Edit Weekly Goal Plan') : t('goals.goalsSettings.createNewWeeklyGoalPlan', 'Create New Weekly Goal Plan')}</DialogTitle>
            <DialogDescription>{t('goals.goalsSettings.defineWeeklySchedule', 'Define a recurring weekly schedule for your goals.')}</DialogDescription>
          </DialogHeader>
          {currentWeeklyPlan && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="plan_name" className="text-right">
                  {t('goals.goalsSettings.planName', 'Plan Name')}
                </Label>
                <Input
                  id="plan_name"
                  value={currentWeeklyPlan.plan_name}
                  onChange={(e) => setCurrentWeeklyPlan({ ...currentWeeklyPlan, plan_name: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="start_date" className="text-right">
                  {t('goals.goalsSettings.startDate', 'Start Date')}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "col-span-3 justify-start text-left font-normal",
                        !currentWeeklyPlan.start_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {currentWeeklyPlan.start_date ? formatDateInUserTimezone(new Date(currentWeeklyPlan.start_date), dateFormat) : <span>{t('goals.goalsSettings.pickADate', 'Pick a date')}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={parseDateInUserTimezone(currentWeeklyPlan.start_date)} // Changed
                      onSelect={(date) => setCurrentWeeklyPlan({ ...currentWeeklyPlan, start_date: formatDateInUserTimezone(date!, 'yyyy-MM-dd') })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="end_date" className="text-right">
                  {t('goals.goalsSettings.endDate', 'End Date (Optional)')}
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "col-span-3 justify-start text-left font-normal",
                        !currentWeeklyPlan.end_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {currentWeeklyPlan.end_date ? formatDateInUserTimezone(parseDateInUserTimezone(currentWeeklyPlan.end_date), dateFormat) : <span>{t('goals.goalsSettings.pickADate', 'Pick a date')}</span>} // Changed
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={currentWeeklyPlan.end_date ? parseDateInUserTimezone(currentWeeklyPlan.end_date) : undefined} // Changed
                      onSelect={(date) => setCurrentWeeklyPlan({ ...currentWeeklyPlan, end_date: date ? formatDateInUserTimezone(date, 'yyyy-MM-dd') : null })}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="is_active" className="text-right">
                  {t('goals.goalsSettings.activePlan', 'Active Plan')}
                </Label>
                <RadioGroup
                  value={currentWeeklyPlan.is_active ? 'true' : 'false'}
                  onValueChange={(value) => setCurrentWeeklyPlan({ ...currentWeeklyPlan, is_active: value === 'true' })}
                  className="flex items-center space-x-4 col-span-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="true" id="active-true" />
                    <Label htmlFor="active-true">{t('goals.goalsSettings.yes', 'Yes')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="false" id="active-false" />
                    <Label htmlFor="active-false">{t('goals.goalsSettings.no', 'No')}</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Day of Week Preset Selection */}
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                <div className="grid grid-cols-4 items-center gap-4" key={day}>
                  <Label htmlFor={`${day}_preset_id`} className="text-right capitalize">
                    {t(`common.${day}`, day.charAt(0).toUpperCase() + day.slice(1))}
                  </Label>
                  <Select
                    value={(currentWeeklyPlan as any)[`${day}_preset_id`] || undefined}
                    onValueChange={(value) => setCurrentWeeklyPlan({ ...currentWeeklyPlan, [`${day}_preset_id`]: value || null })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={t('goals.goalsSettings.selectPreset', { day: t(`common.${day}`, day.charAt(0).toUpperCase() + day.slice(1)), defaultValue: 'Select {{day}} preset' })} />
                    </SelectTrigger>
                    <SelectContent>
                      {goalPresets.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id!}>
                          {preset.preset_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleSaveWeeklyPlan} disabled={weeklyPlanSaving}>
              {weeklyPlanSaving ? t('goals.goalsSettings.saving', 'Saving...') : t('goals.goalsSettings.saveWeeklyPlan', 'Save Weekly Plan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


    </div>
  );
};

export default GoalsSettings;
