import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/NumericInput';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import MealPercentageManager from '@/components/MealPercentageManager';
import { Separator } from '@/components/ui/separator';

import { DEFAULT_GOALS, NUTRIENT_CONFIG } from '@/constants/goals';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';
import { WaterAndExerciseFields } from './WaterAndExerciseFields';
import { NutrientInput } from './NutrientInput';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import {
  useCreatePresetMutation,
  useUpdatePresetMutation,
} from '@/hooks/Goals/useGoals';
import { useMemo, useState } from 'react';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { GoalPreset } from '@/types/goals';
import { getMealPercentage, buildGoalsPayload } from '@/utils/goals';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import { useNutrientGoalPreferences } from '@/hooks/Settings/useNutrientGoalPreferences';
import { useAutoCalculateUserData } from '@/hooks/Goals/useAutoCalculateUserData';
import { NutrientAutoCalculate } from './NutrientAutoCalculate';
import { AutoCalculateToolbar } from './AutoCalculateToolbar';
import { isAutoCalculable } from './nutrientAutoCalculateHelpers';
import {
  computeAutoCalculatedValue,
  type AlgorithmBundle,
} from '@/services/nutrientCalculationService';

interface GoalPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: GoalPreset | null;
  visibleNutrients: string[];
}

const calculateGrams = (
  calories: number,
  percentage: number,
  nutrient: 'protein' | 'carbs' | 'fat',
  dietaryFiber: number = 0
) => {
  const factor = nutrient === 'fat' ? 9 : 4;
  const adjustedCalories = Math.max(0, calories - dietaryFiber * 2);
  return Math.round((adjustedCalories * (percentage / 100)) / factor);
};

export const GoalPresetDialog = ({
  open,
  onOpenChange,
  preset,
  visibleNutrients,
}: GoalPresetDialogProps) => {
  const {
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    fatBreakdownAlgorithm,
    mineralCalculationAlgorithm,
    vitaminCalculationAlgorithm,
    sugarCalculationAlgorithm,
    addedSugarAlgorithm,
  } = usePreferences();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: customNutrients } = useCustomNutrients();
  const { data: mealTypes = [] } = useMealTypes();
  const { data: goalTypePreferences = {} } = useNutrientGoalPreferences();

  const [formData, setFormData] = useState<GoalPreset | null>(() => {
    if (!preset) {
      return { ...DEFAULT_GOALS, preset_name: '', id: undefined } as GoalPreset;
    }
    return { ...preset };
  });

  const [macroInputType, setMacroInputType] = useState<'grams' | 'percentages'>(
    preset?.protein_percentage !== null &&
      preset?.protein_percentage !== undefined
      ? 'percentages'
      : 'grams'
  );

  const [selectedForAutoCalc, setSelectedForAutoCalc] = useState<Set<string>>(
    new Set()
  );

  const autoCalculateUserData = useAutoCalculateUserData(
    formData?.calories ?? 0,
    formData?.fat ?? 0
  );
  const algorithms: AlgorithmBundle = {
    fatBreakdown: fatBreakdownAlgorithm,
    minerals: mineralCalculationAlgorithm,
    vitamins: vitaminCalculationAlgorithm,
    sugar: sugarCalculationAlgorithm,
    addedSugar: addedSugarAlgorithm,
  };

  const eligibleAutoCalcIds = useMemo(() => {
    const standardIds = NUTRIENT_CONFIG.filter(
      (f) => !['protein', 'carbs', 'fat'].includes(f.id)
    )
      .map((f) => f.id)
      .filter((id) => isAutoCalculable(id, undefined, undefined));
    const customIds = (customNutrients ?? [])
      .filter((cn) =>
        isAutoCalculable(
          cn.name,
          cn.aliases,
          goalTypePreferences[cn.name]?.goalType ?? 'minimum'
        )
      )
      .map((cn) => cn.name);
    return [...standardIds, ...customIds];
  }, [customNutrients, goalTypePreferences]);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedForAutoCalc((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleApplySelected = () => {
    if (!autoCalculateUserData) return;
    const updates: Record<string, number> = {};
    selectedForAutoCalc.forEach((id) => {
      const isAddedSugarLike = customNutrients?.some((cn) => cn.name === id);
      const value = computeAutoCalculatedValue(
        id,
        autoCalculateUserData,
        algorithms,
        !!isAddedSugarLike
      );
      if (value !== null) updates[id] = Math.round(value);
    });
    setFormData((prev) => (prev ? { ...prev, ...updates } : prev));
    setSelectedForAutoCalc(new Set());
  };

  const { mutateAsync: createPreset, isPending: createSaving } =
    useCreatePresetMutation();
  const { mutateAsync: updatePreset, isPending: updateSaving } =
    useUpdatePresetMutation();

  const presetSaving = createSaving || updateSaving;

  const visibleMeals = useMemo(
    () => mealTypes.filter((m) => m.is_visible),
    [mealTypes]
  );

  const mealPercentages = useMemo(() => {
    if (!formData) return {};
    const percentages: Record<string, number> = {};
    visibleMeals.forEach((meal) => {
      percentages[meal.name.toLowerCase()] = getMealPercentage(
        meal.name,
        formData
      );
    });
    return percentages;
  }, [formData, visibleMeals]);

  const handleSave = async () => {
    if (!formData || !user) return;

    const toSave = { ...formData };

    if (macroInputType === 'percentages') {
      const cal = toSave.calories;
      const fiber = toSave.dietary_fiber || 0;
      const adjustedCal = Math.max(0, cal - fiber * 2);
      toSave.protein = Math.round(
        (adjustedCal * (toSave.protein_percentage || 0)) / 100 / 4
      );
      toSave.carbs = Math.round(
        (adjustedCal * (toSave.carbs_percentage || 0)) / 100 / 4
      );
      toSave.fat = Math.round(
        (adjustedCal * (toSave.fat_percentage || 0)) / 100 / 9
      );
    } else {
      toSave.protein_percentage = null;
      toSave.carbs_percentage = null;
      toSave.fat_percentage = null;
    }

    try {
      if (toSave.id) {
        await updatePreset({ id: toSave.id, data: toSave });
      } else {
        await createPreset(toSave);
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save preset', error);
    }
  };

  const currentMacroTotal = useMemo(() => {
    if (!formData || macroInputType === 'grams') return 0;
    return (
      (formData.protein_percentage || 0) +
      (formData.carbs_percentage || 0) +
      (formData.fat_percentage || 0)
    );
  }, [formData, macroInputType]);

  const isTotalPercentageValid = useMemo(() => {
    if (!formData) return false;
    const total = visibleMeals.reduce(
      (sum, meal) => sum + getMealPercentage(meal.name, formData),
      0
    );
    return Math.round(total) === 100;
  }, [formData, visibleMeals]);

  if (!formData) return null;
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {formData?.id
                ? t('goals.goalsSettings.editGoalPreset')
                : t('goals.goalsSettings.createNewGoalPreset')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-8 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-end">
              <div className="space-y-1.5">
                <Label>{t('goals.goalsSettings.presetName')}</Label>
                <Input
                  value={formData.preset_name}
                  onChange={(e) =>
                    setFormData({ ...formData, preset_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Macros By</Label>
                <RadioGroup
                  className="flex h-10 items-center gap-4 border rounded-md px-3"
                  value={macroInputType}
                  onValueChange={(v: 'grams' | 'percentages') =>
                    setMacroInputType(v)
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="grams" id="p-g" />
                    <Label htmlFor="p-g" className="text-xs">
                      Grams
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="percentages" id="p-p" />
                    <Label htmlFor="p-p" className="text-xs">
                      Percentages
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {t('nutrition.calories')} ({getEnergyUnitString(energyUnit)})
                </Label>
                <NumericInput
                  step={1}
                  value={Math.round(
                    convertEnergy(formData.calories, 'kcal', energyUnit)
                  )}
                  onValueChange={(val) =>
                    setFormData({
                      ...formData,
                      calories: convertEnergy(val ?? 0, energyUnit, 'kcal'),
                    })
                  }
                />
              </div>
              {(['protein', 'carbs', 'fat'] as const).map((m) => (
                <div key={m} className="space-y-1.5">
                  <Label className="text-xs capitalize">
                    {t(
                      CENTRAL_NUTRIENT_CONFIG[m]?.label ?? String(m),
                      String(m)
                    )}{' '}
                    {macroInputType === 'grams' ? '(g)' : '(%)'}
                  </Label>
                  <NumericInput
                    max={macroInputType === 'percentages' ? 100 : undefined}
                    min={0}
                    step={0.1}
                    decimals={1}
                    value={
                      macroInputType === 'grams'
                        ? ((formData[m] as number) ?? 0)
                        : ((formData[
                            `${m}_percentage` as keyof GoalPreset
                          ] as number) ?? 0)
                    }
                    onValueChange={(val) =>
                      setFormData({
                        ...formData,
                        [macroInputType === 'grams' ? m : `${m}_percentage`]:
                          val ?? 0,
                      })
                    }
                  />
                </div>
              ))}
            </div>
            {macroInputType === 'percentages' && (
              <>
                {/* Die Total-Anzeige auf der rechten Seite */}
                <div
                  className={`mt-2 text-sm font-medium text-right ${currentMacroTotal === 100 ? 'text-green-600' : 'text-destructive'}`}
                >
                  Total: {currentMacroTotal}%{' '}
                  {currentMacroTotal !== 100 && '(Must be 100%)'}
                </div>

                <div className="mt-3 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground grid grid-cols-1 sm:grid-cols-3 gap-2 text-center sm:text-left">
                  <div>
                    <span className="font-semibold">Protein:</span> ≈{' '}
                    {calculateGrams(
                      formData.calories,
                      formData.protein_percentage || 0,
                      'protein',
                      formData.dietary_fiber
                    )}
                    g
                  </div>
                  <div>
                    <span className="font-semibold">Carbs:</span> ≈{' '}
                    {calculateGrams(
                      formData.calories,
                      formData.carbs_percentage || 0,
                      'carbs',
                      formData.dietary_fiber
                    )}
                    g
                  </div>
                  <div>
                    <span className="font-semibold">Fat:</span> ≈{' '}
                    {calculateGrams(
                      formData.calories,
                      formData.fat_percentage || 0,
                      'fat',
                      formData.dietary_fiber
                    )}
                    g
                  </div>
                </div>
              </>
            )}
            <AutoCalculateToolbar
              eligibleCount={eligibleAutoCalcIds.length}
              selectedCount={selectedForAutoCalc.size}
              onSelectAll={() =>
                setSelectedForAutoCalc(new Set(eligibleAutoCalcIds))
              }
              onSelectNone={() => setSelectedForAutoCalc(new Set())}
              onApplySelected={handleApplySelected}
              disabled={!autoCalculateUserData}
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/20 p-4 rounded-xl">
              {NUTRIENT_CONFIG.filter(
                (f) => !['protein', 'carbs', 'fat'].includes(f.id)
              ).map((f) => (
                <div key={f.id}>
                  <NutrientInput<GoalPreset>
                    nutrientId={f.id}
                    state={formData}
                    setState={(val) => setFormData(val)}
                    visibleNutrients={visibleNutrients}
                    customNutrients={customNutrients}
                  />
                  <NutrientAutoCalculate
                    nutrientId={f.id}
                    userData={autoCalculateUserData}
                    algorithms={algorithms}
                    selected={selectedForAutoCalc.has(f.id)}
                    onToggleSelected={(checked) =>
                      toggleSelected(f.id, checked)
                    }
                    onApply={(value) =>
                      setFormData((prev) =>
                        prev ? { ...prev, [f.id]: value } : prev
                      )
                    }
                  />
                </div>
              ))}
              {/* Custom Nutrients */}
              {customNutrients?.map((cn) => {
                const goalType =
                  goalTypePreferences[cn.name]?.goalType ?? 'minimum';
                return (
                  <div key={cn.id}>
                    <NutrientInput<GoalPreset>
                      nutrientId={cn.name}
                      state={formData}
                      setState={(val) => setFormData(val)}
                      visibleNutrients={visibleNutrients}
                      customNutrients={customNutrients}
                    />
                    <NutrientAutoCalculate
                      nutrientId={cn.name}
                      customNutrientAliases={cn.aliases}
                      userData={autoCalculateUserData}
                      goalType={goalType}
                      algorithms={algorithms}
                      selected={selectedForAutoCalc.has(cn.name)}
                      onToggleSelected={(checked) =>
                        toggleSelected(cn.name, checked)
                      }
                      onApply={(value) =>
                        setFormData((prev) =>
                          prev ? { ...prev, [cn.name]: value } : prev
                        )
                      }
                    />
                  </div>
                );
              })}
            </div>
            <Separator />
            <WaterAndExerciseFields
              state={formData}
              setState={(val) => setFormData(val)}
            />
            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">
                {t('goals.goalsSettings.mealCalorieDistribution')}
              </h3>
              <MealPercentageManager
                initialPercentages={mealPercentages}
                totalCalories={formData.calories}
                onPercentagesChange={(p) =>
                  setFormData({
                    ...formData,
                    ...buildGoalsPayload(p, formData),
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSave}
              disabled={presetSaving || !isTotalPercentageValid}
              className="w-full sm:w-auto"
            >
              {t('common.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
