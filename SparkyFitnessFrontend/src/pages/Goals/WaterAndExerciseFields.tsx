import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { ExpandedGoals } from '@/types/goals';
import {
  convertMlToSelectedUnit,
  convertSelectedUnitToMl,
} from '@/utils/nutritionCalculations';

type WaterExerciseBase = Pick<
  ExpandedGoals,
  | 'water_goal_ml'
  | 'target_exercise_calories_burned'
  | 'target_exercise_duration_minutes'
>;

export const WaterAndExerciseFields = <T extends WaterExerciseBase>({
  state,
  setState,
}: {
  state: T;
  setState: (newState: T) => void;
}) => {
  const { t } = useTranslation();
  const { water_display_unit, setWaterDisplayUnit, energyUnit, convertEnergy } =
    usePreferences();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <div className="space-y-1.5">
        <Label className="text-xs">
          {t('goals.goalsSettings.waterGoal', { unit: water_display_unit })}
        </Label>
        <div className="flex gap-2">
          <Input
            min={0}
            type="number"
            value={Math.round(
              convertMlToSelectedUnit(state.water_goal_ml, water_display_unit)
            )}
            onChange={(e) =>
              setState({
                ...state,
                water_goal_ml: convertSelectedUnitToMl(
                  Number(e.target.value),
                  water_display_unit
                ),
              })
            }
          />
          <Select
            value={water_display_unit}
            onValueChange={(v: 'ml' | 'oz' | 'liter') => setWaterDisplayUnit(v)}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ml">ml</SelectItem>
              <SelectItem value="oz">oz</SelectItem>
              <SelectItem value="liter">l</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">
          {t(
            'goals.goalsSettings.targetExerciseCaloriesBurned',
            'Exercise Calories'
          )}
        </Label>
        <Input
          type="number"
          min={0}
          value={Math.round(
            convertEnergy(
              state.target_exercise_calories_burned,
              'kcal',
              energyUnit
            )
          )}
          onChange={(e) =>
            setState({
              ...state,
              target_exercise_calories_burned: convertEnergy(
                Number(e.target.value),
                energyUnit,
                'kcal'
              ),
            })
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">
          {t(
            'goals.goalsSettings.targetExerciseDurationMinutes',
            'Ex. Duration (min)'
          )}
        </Label>
        <Input
          type="number"
          min={0}
          value={state.target_exercise_duration_minutes}
          onChange={(e) =>
            setState({
              ...state,
              target_exercise_duration_minutes: Number(e.target.value),
            })
          }
        />
      </div>
    </div>
  );
};
