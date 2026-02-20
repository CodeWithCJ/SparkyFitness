import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExpandedGoals } from '@/types/goals';
import MealPercentageManager from '@/components/MealPercentageManager';
import { Separator } from '@/components/ui/separator';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useDailyGoals,
  useGoalPresets,
  useSaveGoalsMutation,
} from '@/hooks/Goals/useGoals';
import { DEFAULT_GOALS, NUTRIENT_CONFIG } from '@/constants/goals';
import { NutrientInput } from '@/pages/Goals/NutrientInput';
import { WaterAndExerciseFields } from '@/pages/Goals/WaterAndExerciseFields';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import type { UserCustomNutrient } from '@/types/customNutrient';

interface EditGoalsProps {
  selectedDate: string;
}

const calculateGrams = (
  calories: number,
  percentage: number,
  nutrient: 'protein' | 'carbs' | 'fat'
) => {
  const factor = nutrient === 'fat' ? 9 : 4;
  return Math.round((calories * (percentage / 100)) / factor);
};

/**
 * Internal form component to handle local state management.
 * Using a separate component allows us to initialize state directly from props,
 * avoiding the "setState in useEffect" ESLint error.
 */
const EditGoalsForm = ({
  initialData,
  onSave,
  isSaving,
  customNutrients,
}: {
  initialData: ExpandedGoals;
  selectedDate: string;
  onSave: (goals: ExpandedGoals, clear?: boolean) => Promise<void>;
  isSaving: boolean;
  customNutrients: UserCustomNutrient[];
}) => {
  const {
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    nutrientDisplayPreferences,
  } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';

  const [goals, setGoals] = useState<ExpandedGoals>({
    ...DEFAULT_GOALS,
    ...initialData,
  });
  const [macroInputType, setMacroInputType] = useState<'grams' | 'percentages'>(
    initialData.protein_percentage ? 'percentages' : 'grams'
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(
    undefined
  );

  const { data: goalPresets = [] } = useGoalPresets();

  const goalPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'goal' && p.platform === platform
  );

  const visibleNutrients = useMemo(() => {
    const base = goalPreferences
      ? goalPreferences.visible_nutrients
      : Object.keys(DEFAULT_GOALS);

    // In the goal editor, we should ensure the newly fixed fats are always visible
    // if they are in DEFAULT_GOALS, even if the user hasn't toggled them yet.
    const mustInclude = [
      'saturated_fat',
      'polyunsaturated_fat',
      'monounsaturated_fat',
      'trans_fat',
    ];
    const merged = Array.from(new Set([...base, ...mustInclude]));

    // Also include custom nutrients in the visibility list so they aren't filtered out by NutrientInput
    return [...merged, ...customNutrients.map((cn) => cn.name)];
  }, [goalPreferences, customNutrients]);

  const currentMacroTotal = useMemo(() => {
    if (macroInputType === 'grams') return 100;
    return (
      (goals.protein_percentage || 0) +
      (goals.carbs_percentage || 0) +
      (goals.fat_percentage || 0)
    );
  }, [goals, macroInputType]);

  const isMacroValid = Math.round(currentMacroTotal) === 100;

  const isTotalPercentageValid =
    goals.breakfast_percentage +
      goals.lunch_percentage +
      goals.dinner_percentage +
      goals.snacks_percentage ===
    100;
  const handleApplyPreset = (presetId: string) => {
    const preset = goalPresets.find((p) => p.id === presetId);
    if (preset) {
      setGoals((prev) => ({ ...prev, ...preset }));
      setMacroInputType(preset.protein_percentage ? 'percentages' : 'grams');
    }
  };

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col sm:flex-row gap-4 items-end bg-muted/30 p-4 rounded-lg">
        <div className="flex-1 space-y-1.5 w-full">
          <Label>Apply Preset</Label>
          <Select
            value={selectedPresetId}
            onValueChange={(v) => {
              setSelectedPresetId(v);
              handleApplyPreset(v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a preset" />
            </SelectTrigger>
            <SelectContent>
              {goalPresets.map((p) => (
                <SelectItem key={p.id} value={p.id!}>
                  {p.preset_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          onClick={() => onSave(DEFAULT_GOALS, true)}
          className="text-destructive"
        >
          Reset to Default
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-end">
        <div className="space-y-1.5">
          <Label>Calories ({getEnergyUnitString(energyUnit)})</Label>
          <Input
            id="calories"
            type="number"
            step={1}
            value={Math.round(
              convertEnergy(goals.calories, 'kcal', energyUnit)
            ).toFixed(0)}
            onChange={(e) =>
              setGoals((prev) => ({
                ...prev,
                calories: convertEnergy(
                  Number(e.target.value),
                  energyUnit,
                  'kcal'
                ),
              }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Macros By</Label>
          <RadioGroup
            value={macroInputType}
            onValueChange={(v: 'grams' | 'percentages') => setMacroInputType(v)}
            className="flex h-10 items-center gap-4 border rounded-md px-3"
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="grams" id="m-g" />
              <Label htmlFor="m-g" className="text-xs">
                Grams
              </Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="percentages" id="m-p" />
              <Label htmlFor="m-p" className="text-xs">
                Percentages
              </Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['protein', 'carbs', 'fat'] as const).map((m) => (
          <div key={m} className="space-y-1.5">
            <Label className="text-xs capitalize">
              {m} {macroInputType === 'grams' ? '(g)' : '(%)'}
            </Label>
            <Input
              type="number"
              step={0.1}
              value={
                macroInputType === 'grams'
                  ? (goals[m] ?? 0).toFixed(1)
                  : (
                      goals[`${m}_percentage` as keyof ExpandedGoals] ?? 0
                    ).toFixed(1)
              }
              onChange={(e) => {
                const val = Number(e.target.value);
                if (val < 0 || (macroInputType === 'percentages' && val > 100))
                  return;
                setGoals((prev) => ({
                  ...prev,
                  [macroInputType === 'grams' ? m : `${m}_percentage`]: val,
                }));
              }}
            />
          </div>
        ))}
      </div>

      {macroInputType === 'percentages' && (
        <div className="space-y-2">
          <div
            className={`text-sm font-medium text-right ${isMacroValid ? 'text-green-600' : 'text-destructive'}`}
          >
            Total: {currentMacroTotal}% {!isMacroValid && '(Must be 100%)'}
          </div>
          <div className="p-3 bg-muted/50 rounded-md text-xs text-muted-foreground grid grid-cols-3 gap-2">
            <span>
              Protein:{' '}
              {calculateGrams(
                goals.calories,
                goals.protein_percentage || 0,
                'protein'
              )}
              g
            </span>
            <span>
              Carbs:{' '}
              {calculateGrams(
                goals.calories,
                goals.carbs_percentage || 0,
                'carbs'
              )}
              g
            </span>
            <span>
              Fat:{' '}
              {calculateGrams(goals.calories, goals.fat_percentage || 0, 'fat')}
              g
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/10 p-4 rounded-xl">
        {NUTRIENT_CONFIG.filter(
          (f) => !['protein', 'carbs', 'fat'].includes(f.id)
        ).map((f) => (
          <NutrientInput
            key={f.id}
            nutrientId={f.id}
            state={goals}
            setState={(val) => setGoals(val)}
            visibleNutrients={visibleNutrients}
            customNutrients={customNutrients}
          />
        ))}

        {/* Custom Nutrients */}
        {customNutrients?.map((cn) => {
          return (
            <NutrientInput
              key={cn.id}
              nutrientId={cn.name}
              state={goals}
              setState={(val) => setGoals(val)}
              visibleNutrients={visibleNutrients}
              customNutrients={customNutrients}
            />
          );
        })}
      </div>

      <Separator />
      <WaterAndExerciseFields state={goals} setState={(val) => setGoals(val)} />
      <Separator />

      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Meal Distribution</h3>
        <MealPercentageManager
          initialPercentages={{
            breakfast: goals.breakfast_percentage,
            lunch: goals.lunch_percentage,
            dinner: goals.dinner_percentage,
            snacks: goals.snacks_percentage,
          }}
          totalCalories={goals.calories}
          onPercentagesChange={(p) =>
            setGoals((prev) => ({
              ...prev,
              breakfast_percentage: p.breakfast,
              lunch_percentage: p.lunch,
              dinner_percentage: p.dinner,
              snacks_percentage: p.snacks,
            }))
          }
        />
      </div>

      <DialogFooter>
        <Button
          onClick={() => onSave(goals)}
          disabled={isSaving || !isMacroValid || !isTotalPercentageValid}
          className="w-full"
        >
          {isSaving ? 'Saving...' : 'Save for this Date'}
        </Button>
      </DialogFooter>
    </div>
  );
};

const EditGoalsForToday = ({ selectedDate }: EditGoalsProps) => {
  const { user } = useAuth();
  const { formatDate } = usePreferences();
  const [open, setOpen] = useState(false);

  const { data: serverGoals, isLoading } = useDailyGoals(selectedDate);
  const { mutateAsync: saveGoals, isPending: saving } = useSaveGoalsMutation();
  const { data: customNutrients = [] } = useCustomNutrients();

  const handleSave = async (goalsToSave: ExpandedGoals, clear = false) => {
    if (!user) return;

    // Logic to convert percentages if needed before sending to API
    const finalGoals = { ...goalsToSave };
    if (!clear && finalGoals.protein_percentage) {
      const cal = finalGoals.calories;
      finalGoals.protein =
        (cal * (finalGoals.protein_percentage || 0)) / 100 / 4;
      finalGoals.carbs = (cal * (finalGoals.carbs_percentage || 0)) / 100 / 4;
      finalGoals.fat = (cal * (finalGoals.fat_percentage || 0)) / 100 / 9;
    }

    try {
      await saveGoals({
        date: selectedDate,
        goals: finalGoals,
        cascade: false,
      });
      setOpen(false);
    } catch (error) {
      console.error('Error saving goals:', error);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="dark:text-slate-300">
          <Settings className="w-4 h-4 mr-2" />
          Edit Goals
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Goals for {formatDate(selectedDate)}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 text-center text-muted-foreground animate-pulse">
            Loading daily goals...
          </div>
        ) : (
          serverGoals && (
            <EditGoalsForm
              // The key forces the form to re-mount and reset its internal state
              // whenever the date or the dialog status changes.
              key={`${selectedDate}-${open}`}
              initialData={serverGoals}
              selectedDate={selectedDate}
              onSave={handleSave}
              isSaving={saving}
              customNutrients={customNutrients}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EditGoalsForToday;
