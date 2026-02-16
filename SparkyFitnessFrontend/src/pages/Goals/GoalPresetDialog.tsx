import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { GoalPreset } from '@/api/Goals/goals';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';

interface GoalPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: GoalPreset | null;
  visibleNutrients: string[];
}

const calculateGrams = (
  calories: number,
  percentage: number,
  nutrient: 'protein' | 'carbs' | 'fat'
) => {
  const factor = nutrient === 'fat' ? 9 : 4;
  return Math.round((calories * (percentage / 100)) / factor);
};

export const GoalPresetDialog = ({
  open,
  onOpenChange,
  preset,
  visibleNutrients,
}: GoalPresetDialogProps) => {
  const { energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: customNutrients } = useCustomNutrients();
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

  const { mutateAsync: createPreset, isPending: createSaving } =
    useCreatePresetMutation();
  const { mutateAsync: updatePreset, isPending: updateSaving } =
    useUpdatePresetMutation();

  const presetSaving = createSaving || updateSaving;

  const mealPercentages = useMemo(() => {
    if (!formData) return { breakfast: 25, lunch: 25, dinner: 25, snacks: 25 };
    return {
      breakfast: formData.breakfast_percentage ?? 25,
      lunch: formData.lunch_percentage ?? 25,
      dinner: formData.dinner_percentage ?? 25,
      snacks: formData.snacks_percentage ?? 25,
    };
  }, [formData]);

  const handleSave = async () => {
    if (!formData || !user) return;

    const toSave = { ...formData };

    if (macroInputType === 'percentages') {
      const cal = toSave.calories;
      toSave.protein = (cal * (toSave.protein_percentage || 0)) / 100 / 4;
      toSave.carbs = (cal * (toSave.carbs_percentage || 0)) / 100 / 4;
      toSave.fat = (cal * (toSave.fat_percentage || 0)) / 100 / 9;
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

  const isTotalPercentageValid =
    formData.breakfast_percentage +
      formData.lunch_percentage +
      formData.dinner_percentage +
      formData.snacks_percentage ===
    100;
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
                <Input
                  type="number"
                  step={1}
                  value={Math.round(
                    convertEnergy(formData.calories, 'kcal', energyUnit)
                  ).toFixed(0)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      calories: convertEnergy(
                        Number(e.target.value),
                        energyUnit,
                        'kcal'
                      ),
                    })
                  }
                />
              </div>
              {(['protein', 'carbs', 'fat'] as const).map((m) => (
                <div key={m} className="space-y-1.5">
                  <Label className="text-xs capitalize">
                    {t(CENTRAL_NUTRIENT_CONFIG[m].label, m)}{' '}
                    {macroInputType === 'grams' ? '(g)' : '(%)'}
                  </Label>
                  <Input
                    max={100}
                    min={0}
                    type="number"
                    step={0.1}
                    value={
                      macroInputType === 'grams'
                        ? ((formData[m] as number) ?? 0).toFixed(1)
                        : (
                            (formData[
                              `${m}_percentage` as keyof GoalPreset
                            ] as number) ?? 0
                          ).toFixed(1)
                    }
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        [macroInputType === 'grams' ? m : `${m}_percentage`]:
                          Number(e.target.value),
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
                      'protein'
                    )}
                    g
                  </div>
                  <div>
                    <span className="font-semibold">Carbs:</span> ≈{' '}
                    {calculateGrams(
                      formData.calories,
                      formData.carbs_percentage || 0,
                      'carbs'
                    )}
                    g
                  </div>
                  <div>
                    <span className="font-semibold">Fat:</span> ≈{' '}
                    {calculateGrams(
                      formData.calories,
                      formData.fat_percentage || 0,
                      'fat'
                    )}
                    g
                  </div>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/20 p-4 rounded-xl">
              {NUTRIENT_CONFIG.filter(
                (f) => !['protein', 'carbs', 'fat'].includes(f.id)
              ).map((f) => (
                <NutrientInput<GoalPreset>
                  key={f.id}
                  nutrientId={f.id}
                  state={formData}
                  setState={(val) => setFormData(val)}
                  visibleNutrients={visibleNutrients}
                />
              ))}
              {/* Custom Nutrients */}
              {customNutrients?.map((cn) => {
                return (
                  <NutrientInput<GoalPreset>
                    key={cn.id}
                    nutrientId={cn.name}
                    state={formData}
                    setState={(val) => setFormData(val)}
                    visibleNutrients={visibleNutrients}
                  />
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
                    breakfast_percentage: p.breakfast,
                    lunch_percentage: p.lunch,
                    dinner_percentage: p.dinner,
                    snacks_percentage: p.snacks,
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
