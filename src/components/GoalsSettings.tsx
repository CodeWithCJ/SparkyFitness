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
import { usePreferences } from "@/contexts/PreferencesContext"; // Added import
import { GoalPreset, createGoalPreset, getGoalPresets, updateGoalPreset, deleteGoalPreset } from '@/services/goalPresetService';
import { WeeklyGoalPlan, createWeeklyGoalPlan, getWeeklyGoalPlans, updateWeeklyGoalPlan, deleteWeeklyGoalPlan } from '@/services/weeklyGoalPlanService';
import { PlusCircle, Edit, Trash2, CalendarDays } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MealPercentageManager from './MealPercentageManager';
import { Separator } from "@/components/ui/separator";

import { ExpandedGoals } from '@/types/goals';

const GoalsSettings = () => {
  const { user } = useAuth();
  const { dateFormat, formatDateInUserTimezone, parseDateInUserTimezone } = usePreferences(); // Corrected destructuring
  const [goals, setGoals] = useState<ExpandedGoals>({
    calories: 2000, protein: 150, carbs: 250, fat: 67, water_goal: 8,
    saturated_fat: 20, polyunsaturated_fat: 10, monounsaturated_fat: 25, trans_fat: 0,
    cholesterol: 300, sodium: 2300, potassium: 3500, dietary_fiber: 25, sugars: 50,
    vitamin_a: 900, vitamin_c: 90, calcium: 1000, iron: 18,
    target_exercise_calories_burned: 0, target_exercise_duration_minutes: 0,
    protein_percentage: null, carbs_percentage: null, fat_percentage: null,
    breakfast_percentage: 25, lunch_percentage: 25, dinner_percentage: 25, snacks_percentage: 25
  });
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

      if (data && data.length > 0) {
        const goalData = data[0];
        setGoals({
          calories: goalData.calories || 2000,
          protein: goalData.protein || 150,
          carbs: goalData.carbs || 250,
          fat: goalData.fat || 67,
          water_goal: goalData.water_goal || 8,
          saturated_fat: goalData.saturated_fat || 20,
          polyunsaturated_fat: goalData.polyunsaturated_fat || 10,
          monounsaturated_fat: goalData.monounsaturated_fat || 25,
          trans_fat: goalData.trans_fat || 0,
          cholesterol: goalData.cholesterol || 300,
          sodium: goalData.sodium || 2300,
          potassium: goalData.potassium || 3500,
          dietary_fiber: goalData.dietary_fiber || 25,
          sugars: goalData.sugars || 50,
          vitamin_a: goalData.vitamin_a || 900,
          vitamin_c: goalData.vitamin_c || 90,
          calcium: goalData.calcium || 1000,
          iron: goalData.iron || 18,
          target_exercise_calories_burned: goalData.target_exercise_calories_burned || 0,
          target_exercise_duration_minutes: goalData.target_exercise_duration_minutes || 0,
          protein_percentage: goalData.protein_percentage || null,
          carbs_percentage: goalData.carbs_percentage || null,
          fat_percentage: goalData.fat_percentage || null,
          breakfast_percentage: goalData.breakfast_percentage || 25,
          lunch_percentage: goalData.lunch_percentage || 25,
          dinner_percentage: goalData.dinner_percentage || 25,
          snacks_percentage: goalData.snacks_percentage || 25
        });
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
        title: "Error",
        description: "Failed to load goal presets.",
        variant: "destructive",
      });
    }
  };

  const handleCreatePresetClick = () => {
    setCurrentPreset({
      preset_name: '',
      calories: 2000, protein: 150, carbs: 250, fat: 67, water_goal: 8,
      saturated_fat: 20, polyunsaturated_fat: 10, monounsaturated_fat: 25, trans_fat: 0,
      cholesterol: 300, sodium: 2300, potassium: 3500, dietary_fiber: 25, sugars: 50,
      vitamin_a: 900, vitamin_c: 90, calcium: 1000, iron: 18,
      target_exercise_calories_burned: 0, target_exercise_duration_minutes: 0,
      protein_percentage: null, carbs_percentage: null, fat_percentage: null,
      breakfast_percentage: 25, lunch_percentage: 25, dinner_percentage: 25, snacks_percentage: 25
    });
    setPresetMacroInputType('grams'); // Default to grams for new preset
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
        toast({ title: "Success", description: "Goal preset updated successfully." });
      } else {
        await createGoalPreset(presetToSave);
        toast({ title: "Success", description: "Goal preset created successfully." });
      }
      setIsPresetDialogOpen(false);
      loadGoalPresets(); // Refresh the list
    } catch (error) {
      console.error('Error saving preset:', error);
      toast({
        title: "Error",
        description: "Failed to save goal preset.",
        variant: "destructive",
      });
    } finally {
      setPresetSaving(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm("Are you sure you want to delete this preset?")) return;
    try {
      await deleteGoalPreset(presetId);
      toast({ title: "Success", description: "Goal preset deleted successfully." });
      loadGoalPresets();
    } catch (error) {
      console.error('Error deleting preset:', error);
      toast({
        title: "Error",
        description: "Failed to delete goal preset.",
        variant: "destructive",
      });
    }
  };

  const calculateMacroGrams = (calories: number, percentage: number) => {
    // Protein and Carbs: 4 kcal/g, Fat: 9 kcal/g
    if (percentage === null) return 0;
    // This logic needs to be improved to correctly identify which macro is being calculated
    // For now, assuming it's called for each macro type individually
    // This function should ideally be in a utility or service file
    // For a generic calculation, we need to know the macro type
    // As a placeholder, let's assume it's for protein/carbs (4 kcal/g)
    return (calories * (percentage / 100)) / 4;
  };

  const calculateMacroPercentage = (calories: number, grams: number, macroType: 'protein' | 'carbs' | 'fat') => {
    if (calories === 0) return 0;
    if (macroType === 'protein' || macroType === 'carbs') {
      return (grams * 4 / calories) * 100;
    } else if (macroType === 'fat') {
      return (grams * 9 / calories) * 100;
    }
    return 0;
  };

  // Weekly Plan Functions
  const loadWeeklyPlans = async () => {
    try {
      const plans = await getWeeklyGoalPlans();
      setWeeklyPlans(plans);
    } catch (error) {
      console.error('Error loading weekly plans:', error);
      toast({
        title: "Error",
        description: "Failed to load weekly plans.",
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
        toast({ title: "Success", description: "Weekly plan updated successfully." });
      } else {
        await createWeeklyGoalPlan(currentWeeklyPlan);
        toast({ title: "Success", description: "Weekly plan created successfully." });
      }
      setIsWeeklyPlanDialogOpen(false);
      loadWeeklyPlans(); // Refresh the list
    } catch (error) {
      console.error('Error saving weekly plan:', error);
      toast({
        title: "Error",
        description: "Failed to save weekly plan.",
        variant: "destructive",
      });
    } finally {
      setWeeklyPlanSaving(false);
    }
  };

  const handleDeleteWeeklyPlan = async (planId: string) => {
    if (!confirm("Are you sure you want to delete this weekly plan?")) return;
    try {
      await deleteWeeklyGoalPlan(planId);
      toast({ title: "Success", description: "Weekly plan deleted successfully." });
      loadWeeklyPlans();
    } catch (error) {
      console.error('Error deleting weekly plan:', error);
      toast({
        title: "Error",
        description: "Failed to delete weekly plan.",
        variant: "destructive",
      });
    }
  };

  const saveGoals = async () => {
    if (!user) return;

    try {
      setSaving(true);
      
      const today = new Date().toISOString().split('T')[0];
      
      await apiCall(`/goals/manage-timeline`, {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          p_start_date: today,
          p_calories: goals.calories,
          p_protein: goals.protein,
          p_carbs: goals.carbs,
          p_fat: goals.fat,
          p_water_goal: goals.water_goal,
          p_saturated_fat: goals.saturated_fat,
          p_polyunsaturated_fat: goals.polyunsaturated_fat,
          p_monounsaturated_fat: goals.monounsaturated_fat,
          p_trans_fat: goals.trans_fat,
          p_cholesterol: goals.cholesterol,
          p_sodium: goals.sodium,
          p_potassium: goals.potassium,
          p_dietary_fiber: goals.dietary_fiber,
          p_sugars: goals.sugars,
          p_vitamin_a: goals.vitamin_a,
          p_vitamin_c: goals.vitamin_c,
          p_calcium: goals.calcium,
          p_iron: goals.iron,
          p_target_exercise_calories_burned: goals.target_exercise_calories_burned,
          p_target_exercise_duration_minutes: goals.target_exercise_duration_minutes,
          p_protein_percentage: goals.protein_percentage,
          p_carbs_percentage: goals.carbs_percentage,
          p_fat_percentage: goals.fat_percentage,
          p_breakfast_percentage: goals.breakfast_percentage,
          p_lunch_percentage: goals.lunch_percentage,
          p_dinner_percentage: goals.dinner_percentage,
          p_snacks_percentage: goals.snacks_percentage
        }),
      });

      toast({
        title: "Success",
        description: "Goals updated and will apply for the next 6 months (or until your next future goal)",
      });

      toast({
        title: "Success",
        description: "Goals updated and will apply for the next 6 months (or until your next future goal)",
      });
      
      await loadGoals();
    } catch (error) {
      console.error('Error saving goals:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div>Please sign in to manage your goals.</div>;
  }

  if (loading) {
    return <div>Loading goals...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Goals Settings</h2>
        <Badge variant="outline" className="text-lg px-3 py-1">
          <Target className="w-4 h-4 mr-2" />
          Cascading Goals
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            Daily Nutrition Goals
            <div className="text-sm font-normal text-gray-600 ml-2">
              (Changes cascade for 6 months from today or until your next future goal)
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Primary Macros */}
            <div>
              <Label htmlFor="calories">Calories</Label>
              <Input
                id="calories"
                type="number"
                value={goals.calories}
                onChange={(e) => setGoals({ ...goals, calories: Number(e.target.value) })}
              />
            </div>
            
            <div>
              <Label htmlFor="protein">Protein (g)</Label>
              <Input
                id="protein"
                type="number"
                value={goals.protein}
                onChange={(e) => setGoals({ ...goals, protein: Number(e.target.value) })}
              />
            </div>
            
            <div>
              <Label htmlFor="carbs">Carbohydrates (g)</Label>
              <Input
                id="carbs"
                type="number"
                value={goals.carbs}
                onChange={(e) => setGoals({ ...goals, carbs: Number(e.target.value) })}
              />
            </div>
            
            <div>
              <Label htmlFor="fat">Fat (g)</Label>
              <Input
                id="fat"
                type="number"
                value={goals.fat}
                onChange={(e) => setGoals({ ...goals, fat: Number(e.target.value) })}
              />
            </div>

            {/* Fat Types */}
            <div>
              <Label htmlFor="saturated_fat">Saturated Fat (g)</Label>
              <Input
                id="saturated_fat"
                type="number"
                value={goals.saturated_fat}
                onChange={(e) => setGoals({ ...goals, saturated_fat: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label htmlFor="polyunsaturated_fat">Polyunsaturated Fat (g)</Label>
              <Input
                id="polyunsaturated_fat"
                type="number"
                value={goals.polyunsaturated_fat}
                onChange={(e) => setGoals({ ...goals, polyunsaturated_fat: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label htmlFor="monounsaturated_fat">Monounsaturated Fat (g)</Label>
              <Input
                id="monounsaturated_fat"
                type="number"
                value={goals.monounsaturated_fat}
                onChange={(e) => setGoals({ ...goals, monounsaturated_fat: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label htmlFor="trans_fat">Trans Fat (g)</Label>
              <Input
                id="trans_fat"
                type="number"
                value={goals.trans_fat}
                onChange={(e) => setGoals({ ...goals, trans_fat: Number(e.target.value) })}
              />
            </div>

            {/* Other Nutrients */}
            <div>
              <Label htmlFor="cholesterol">Cholesterol (mg)</Label>
              <Input
                id="cholesterol"
                type="number"
                value={goals.cholesterol}
                onChange={(e) => setGoals({ ...goals, cholesterol: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="sodium">Sodium (mg)</Label>
              <Input
                id="sodium"
                type="number"
                value={goals.sodium}
                onChange={(e) => setGoals({ ...goals, sodium: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="potassium">Potassium (mg)</Label>
              <Input
                id="potassium"
                type="number"
                value={goals.potassium}
                onChange={(e) => setGoals({ ...goals, potassium: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="dietary_fiber">Dietary Fiber (g)</Label>
              <Input
                id="dietary_fiber"
                type="number"
                value={goals.dietary_fiber}
                onChange={(e) => setGoals({ ...goals, dietary_fiber: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="sugars">Sugars (g)</Label>
              <Input
                id="sugars"
                type="number"
                value={goals.sugars}
                onChange={(e) => setGoals({ ...goals, sugars: Number(e.target.value) })}
              />
            </div>
            {/* Vitamins and Minerals */}
            <div>
              <Label htmlFor="vitamin_a">Vitamin A (mcg)</Label>
              <Input
                id="vitamin_a"
                type="number"
                value={goals.vitamin_a}
                onChange={(e) => setGoals({ ...goals, vitamin_a: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="vitamin_c">Vitamin C (mg)</Label>
              <Input
                id="vitamin_c"
                type="number"
                value={goals.vitamin_c}
                onChange={(e) => setGoals({ ...goals, vitamin_c: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="calcium">Calcium (mg)</Label>
              <Input
                id="calcium"
                type="number"
                value={goals.calcium}
                onChange={(e) => setGoals({ ...goals, calcium: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="iron">Iron (mg)</Label>
              <Input
                id="iron"
                type="number"
                value={goals.iron}
                onChange={(e) => setGoals({ ...goals, iron: Number(e.target.value) })}
              />
            </div>
            
            <div>
              <Label htmlFor="water">Water Goal (glasses)</Label>
              <Input
                id="water"
                type="number"
                value={goals.water_goal}
                onChange={(e) => setGoals({ ...goals, water_goal: Number(e.target.value) })}
              />
            </div>
            {/* Exercise Goals */}
            <div>
              <Label htmlFor="target_exercise_calories_burned">Target Exercise Calories Burned</Label>
              <Input
                id="target_exercise_calories_burned"
                type="number"
                value={goals.target_exercise_calories_burned}
                onChange={(e) => setGoals({ ...goals, target_exercise_calories_burned: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="target_exercise_duration_minutes">Target Exercise Duration (minutes)</Label>
              <Input
                id="target_exercise_duration_minutes"
                type="number"
                value={goals.target_exercise_duration_minutes}
                onChange={(e) => setGoals({ ...goals, target_exercise_duration_minutes: Number(e.target.value) })}
              />
            </div>
          </div>

          <Separator className="my-6" />

          <h3 className="text-lg font-semibold mb-4">Meal Calorie Distribution</h3>
          <MealPercentageManager
            initialPercentages={{
              breakfast: goals.breakfast_percentage,
              lunch: goals.lunch_percentage,
              dinner: goals.dinner_percentage,
              snacks: goals.snacks_percentage,
            }}
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
              onClick={saveGoals}
              className="w-full"
              disabled={saving || (goals.breakfast_percentage + goals.lunch_percentage + goals.dinner_percentage + goals.snacks_percentage) !== 100}
            >
              {saving ? 'Saving...' : 'Save Goals'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Goal Presets Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">Goal Presets</CardTitle>
          <Button size="sm" onClick={handleCreatePresetClick}>
            <PlusCircle className="w-4 h-4 mr-2" /> Create New Preset
          </Button>
        </CardHeader>
        <CardContent>
          {goalPresets.length === 0 ? (
            <p className="text-gray-500">No goal presets defined yet. Create one to get started!</p>
          ) : (
            <div className="space-y-4">
              {goalPresets.map((preset) => (
                <div key={preset.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <h4 className="font-semibold">{preset.preset_name}</h4>
                    <p className="text-sm text-gray-600">
                      {preset.calories} kcal, {Number(preset.protein || 0).toFixed(0)}g P, {Number(preset.carbs || 0).toFixed(0)}g C, {Number(preset.fat || 0).toFixed(0)}g F
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditPresetClick(preset)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeletePreset(preset.id!)}>
                      <Trash2 className="w-4 h-4" />
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
            <DialogTitle>{currentPreset?.id ? 'Edit Goal Preset' : 'Create New Goal Preset'}</DialogTitle>
            <DialogDescription>Define a reusable set of nutrition and exercise goals.</DialogDescription>
          </DialogHeader>
          {currentPreset && (
            <div className="space-y-6 py-4">
              {/* Preset Name */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="preset_name" className="text-right">
                  Preset Name
                </Label>
                <Input
                  id="preset_name"
                  value={currentPreset.preset_name}
                  onChange={(e) => setCurrentPreset({ ...currentPreset, preset_name: e.target.value })}
                  className="col-span-3"
                />
              </div>

              {/* Main Nutrients Section */}
              <h3 className="text-lg font-semibold col-span-full">Main Nutrients</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Calories */}
                <div>
                  <Label htmlFor="calories">Calories</Label>
                  <Input
                    id="calories"
                    type="number"
                    value={currentPreset.calories}
                    onChange={(e) => setCurrentPreset({ ...currentPreset, calories: Number(e.target.value) })}
                  />
                </div>

                {/* Macro Input Type Toggle */}
                <div className="col-span-full flex items-center gap-4">
                  <Label className="text-right">Macros By</Label>
                  <RadioGroup
                    value={presetMacroInputType}
                    onValueChange={(value: 'grams' | 'percentages') => setPresetMacroInputType(value)}
                    className="flex items-center space-x-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="grams" id="macro-grams" />
                      <Label htmlFor="macro-grams">Grams</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="percentages" id="macro-percentages" />
                      <Label htmlFor="macro-percentages">Percentages</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Protein */}
                <div>
                  <Label htmlFor="protein">
                    {presetMacroInputType === 'grams' ? 'Protein (g)' : 'Protein (%)'}
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
                    {presetMacroInputType === 'grams' ? 'Carbs (g)' : 'Carbs (%)'}
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
                    {presetMacroInputType === 'grams' ? 'Fat (g)' : 'Fat (%)'}
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
                    `Calculated Grams: Protein ${Number(currentPreset.protein || 0).toFixed(0)}g, Carbs ${Number(currentPreset.carbs || 0).toFixed(0)}g, Fat ${Number(currentPreset.fat || 0).toFixed(0)}g`
                  )}
                </div>
              </div>

              {/* Fat Breakdown Section */}
              <h3 className="text-lg font-semibold col-span-full mt-4">Fat Breakdown</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="saturated_fat">Sat Fat (g)</Label>
                  <Input id="saturated_fat" type="number" value={currentPreset.saturated_fat} onChange={(e) => setCurrentPreset({ ...currentPreset, saturated_fat: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="polyunsaturated_fat">Poly Fat (g)</Label>
                  <Input id="polyunsaturated_fat" type="number" value={currentPreset.polyunsaturated_fat} onChange={(e) => setCurrentPreset({ ...currentPreset, polyunsaturated_fat: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="monounsaturated_fat">Mono Fat (g)</Label>
                  <Input id="monounsaturated_fat" type="number" value={currentPreset.monounsaturated_fat} onChange={(e) => setCurrentPreset({ ...currentPreset, monounsaturated_fat: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="trans_fat">Trans Fat (g)</Label>
                  <Input id="trans_fat" type="number" value={currentPreset.trans_fat} onChange={(e) => setCurrentPreset({ ...currentPreset, trans_fat: Number(e.target.value) })} />
                </div>
              </div>

              {/* Minerals & Other Section */}
              <h3 className="text-lg font-semibold col-span-full mt-4">Minerals & Other</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="cholesterol">Cholesterol (mg)</Label>
                  <Input id="cholesterol" type="number" value={currentPreset.cholesterol} onChange={(e) => setCurrentPreset({ ...currentPreset, cholesterol: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="sodium">Sodium (mg)</Label>
                  <Input id="sodium" type="number" value={currentPreset.sodium} onChange={(e) => setCurrentPreset({ ...currentPreset, sodium: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="potassium">Potassium (mg)</Label>
                  <Input id="potassium" type="number" value={currentPreset.potassium} onChange={(e) => setCurrentPreset({ ...currentPreset, potassium: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="dietary_fiber">Fiber (g)</Label>
                  <Input id="dietary_fiber" type="number" value={currentPreset.dietary_fiber} onChange={(e) => setCurrentPreset({ ...currentPreset, dietary_fiber: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="sugars">Sugars (g)</Label>
                  <Input id="sugars" type="number" value={currentPreset.sugars} onChange={(e) => setCurrentPreset({ ...currentPreset, sugars: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="vitamin_a">Vitamin A (mcg)</Label>
                  <Input id="vitamin_a" type="number" value={currentPreset.vitamin_a} onChange={(e) => setCurrentPreset({ ...currentPreset, vitamin_a: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="vitamin_c">Vitamin C (mg)</Label>
                  <Input id="vitamin_c" type="number" value={currentPreset.vitamin_c} onChange={(e) => setCurrentPreset({ ...currentPreset, vitamin_c: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="calcium">Calcium (mg)</Label>
                  <Input id="calcium" type="number" value={currentPreset.calcium} onChange={(e) => setCurrentPreset({ ...currentPreset, calcium: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="iron">Iron (mg)</Label>
                  <Input id="iron" type="number" value={currentPreset.iron} onChange={(e) => setCurrentPreset({ ...currentPreset, iron: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="water_goal">Water (gl)</Label>
                  <Input id="water_goal" type="number" value={currentPreset.water_goal} onChange={(e) => setCurrentPreset({ ...currentPreset, water_goal: Number(e.target.value) })} />
                </div>
              </div>

              {/* Exercise Section */}
              <h3 className="text-lg font-semibold col-span-full mt-4">Exercise</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="target_exercise_calories_burned">Exercise Calories</Label>
                  <Input id="target_exercise_calories_burned" type="number" value={currentPreset.target_exercise_calories_burned} onChange={(e) => setCurrentPreset({ ...currentPreset, target_exercise_calories_burned: Number(e.target.value) })} />
                </div>
                <div>
                  <Label htmlFor="target_exercise_duration_minutes">Ex. Duration (min)</Label>
                  <Input id="target_exercise_duration_minutes" type="number" value={currentPreset.target_exercise_duration_minutes} onChange={(e) => setCurrentPreset({ ...currentPreset, target_exercise_duration_minutes: Number(e.target.value) })} />
                </div>
              </div>
            </div>
          )}
          {currentPreset && (
            <>
              <Separator className="my-6" />
              <h3 className="text-lg font-semibold col-span-full mt-4">Meal Calorie Distribution</h3>
              <MealPercentageManager
                initialPercentages={{
                  breakfast: currentPreset.breakfast_percentage,
                  lunch: currentPreset.lunch_percentage,
                  dinner: currentPreset.dinner_percentage,
                  snacks: currentPreset.snacks_percentage,
                }}
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
                  {presetSaving ? 'Saving...' : 'Save Preset'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Weekly Goal Plans Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">Weekly Goal Plans (WIP)</CardTitle>
          <Button size="sm" onClick={handleCreateWeeklyPlanClick}>
            <PlusCircle className="w-4 h-4 mr-2" /> Create New Plan
          </Button>
        </CardHeader>
        <CardContent>
          {weeklyPlans.length === 0 ? (
            <p className="text-gray-500">No weekly goal plans defined yet. Create one to automate your goals!</p>
          ) : (
            <div className="space-y-4">
              {weeklyPlans.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between p-3 border rounded-md">
                  <div>
                    <h4 className="font-semibold">{plan.plan_name} {plan.is_active && <Badge variant="secondary">Active</Badge>}</h4>
                    <p className="text-sm text-gray-600">
                      {formatDateInUserTimezone(plan.start_date)} to {plan.end_date ? formatDateInUserTimezone(plan.end_date) : 'Indefinite'}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditWeeklyPlanClick(plan)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteWeeklyPlan(plan.id!)}>
                      <Trash2 className="w-4 h-4" />
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
            <DialogTitle>{currentWeeklyPlan?.id ? 'Edit Weekly Goal Plan' : 'Create New Weekly Goal Plan'}</DialogTitle>
            <DialogDescription>Define a recurring weekly schedule for your goals.</DialogDescription>
          </DialogHeader>
          {currentWeeklyPlan && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="plan_name" className="text-right">
                  Plan Name
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
                  Start Date
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
                      {currentWeeklyPlan.start_date ? formatDateInUserTimezone(new Date(currentWeeklyPlan.start_date), dateFormat) : <span>Pick a date</span>}
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
                  End Date (Optional)
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
                      {currentWeeklyPlan.end_date ? formatDateInUserTimezone(parseDateInUserTimezone(currentWeeklyPlan.end_date), dateFormat) : <span>Pick a date</span>} // Changed
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
                  Active Plan
                </Label>
                <RadioGroup
                  value={currentWeeklyPlan.is_active ? 'true' : 'false'}
                  onValueChange={(value) => setCurrentWeeklyPlan({ ...currentWeeklyPlan, is_active: value === 'true' })}
                  className="flex items-center space-x-4 col-span-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="true" id="active-true" />
                    <Label htmlFor="active-true">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="false" id="active-false" />
                    <Label htmlFor="active-false">No</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Day of Week Preset Selection */}
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => (
                <div className="grid grid-cols-4 items-center gap-4" key={day}>
                  <Label htmlFor={`${day}_preset_id`} className="text-right capitalize">
                    {day}
                  </Label>
                  <Select
                    value={(currentWeeklyPlan as any)[`${day}_preset_id`] || undefined}
                    onValueChange={(value) => setCurrentWeeklyPlan({ ...currentWeeklyPlan, [`${day}_preset_id`]: value || null })}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={`Select ${day} preset`} />
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
              {weeklyPlanSaving ? 'Saving...' : 'Save Weekly Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GoalsSettings;
