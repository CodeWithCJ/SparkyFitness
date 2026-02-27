import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import MealPercentageManager from '@/components/MealPercentageManager';
import {
  convertMlToSelectedUnit,
  convertSelectedUnitToMl,
} from '@/utils/nutritionCalculations';
import { useTranslation } from 'react-i18next';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { ExpandedGoals } from '@/types/goals';

export interface NutrientGoalsProps {
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  editedPlan: ExpandedGoals | null;
  handlePercentagesChange: (newPercentages: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snacks: number;
  }) => void;
  localEnergyUnit: 'kcal' | 'kJ';
  localWaterUnit: 'ml' | 'oz' | 'liter';
  memoizedInitialPercentages: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snacks: number;
  };
  setEditedPlan: React.Dispatch<React.SetStateAction<ExpandedGoals | null>>;
  setLocalWaterUnit: React.Dispatch<
    React.SetStateAction<'ml' | 'oz' | 'liter'>
  >;
}

export const NutrientGoals = ({
  convertEnergy,
  editedPlan,
  handlePercentagesChange,
  localEnergyUnit,
  localWaterUnit,
  memoizedInitialPercentages,
  setEditedPlan,
  setLocalWaterUnit,
}: NutrientGoalsProps) => {
  const { t } = useTranslation();
  const { data: customNutrients } = useCustomNutrients();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      {/* 1. Daily Macro Targets */}
      <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
        <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
          <h3 className="text-white font-bold text-sm">Daily Macro Targets</h3>
        </div>
        <Table>
          <TableBody>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Carbohydrates (
                {editedPlan?.calories
                  ? Math.round(
                      ((editedPlan.carbs * 4) /
                        convertEnergy(
                          editedPlan.calories,
                          localEnergyUnit,
                          'kcal'
                        )) *
                        100
                    )
                  : 0}
                %)
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.carbs ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev ? { ...prev, carbs: Number(e.target.value) } : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">g</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Protein (
                {editedPlan?.calories
                  ? Math.round(
                      ((editedPlan.protein * 4) /
                        convertEnergy(
                          editedPlan.calories,
                          localEnergyUnit,
                          'kcal'
                        )) *
                        100
                    )
                  : 0}
                %)
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.protein ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, protein: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">g</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Fats (
                {editedPlan?.calories
                  ? Math.round(
                      ((editedPlan.fat * 9) /
                        convertEnergy(
                          editedPlan.calories,
                          localEnergyUnit,
                          'kcal'
                        )) *
                        100
                    )
                  : 0}
                %)
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.fat ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev ? { ...prev, fat: Number(e.target.value) } : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">g</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-none hover:bg-transparent bg-[#252527]">
              <TableCell className="font-medium text-gray-300 text-sm">
                Fiber
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.dietary_fiber ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, dietary_fiber: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">g</span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* 2. Fat Breakdown */}
      <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
        <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
          <h3 className="text-white font-bold text-sm">Fat Breakdown</h3>
        </div>
        <Table>
          <TableBody>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Saturated Fat
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.saturated_fat ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, saturated_fat: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">g</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Trans Fat
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.trans_fat ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, trans_fat: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">g</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Polyunsaturated
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.polyunsaturated_fat ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? {
                              ...prev,
                              polyunsaturated_fat: Number(e.target.value),
                            }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">g</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-none hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Monounsaturated
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.monounsaturated_fat ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? {
                              ...prev,
                              monounsaturated_fat: Number(e.target.value),
                            }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">g</span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* 3. Minerals & Other */}
      <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
        <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
          <h3 className="text-white font-bold text-sm">Minerals & Other</h3>
        </div>
        <Table>
          <TableBody>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Cholesterol
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={1}
                    value={(editedPlan?.cholesterol ?? 0).toFixed(0)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, cholesterol: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">mg</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Sodium
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={1}
                    value={(editedPlan?.sodium ?? 0).toFixed(0)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, sodium: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">mg</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Potassium
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={1}
                    value={(editedPlan?.potassium ?? 0).toFixed(0)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, potassium: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">mg</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Calcium
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={1}
                    value={(editedPlan?.calcium ?? 0).toFixed(0)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, calcium: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">mg</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-none hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Iron
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.iron ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev ? { ...prev, iron: Number(e.target.value) } : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">mg</span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* 4. Sugars & Vitamins */}
      <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
        <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
          <h3 className="text-white font-bold text-sm">Sugars & Vitamins</h3>
        </div>
        <Table>
          <TableBody>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Sugar
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.sugars ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, sugars: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">g</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Vitamin A
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={1}
                    value={(editedPlan?.vitamin_a ?? 0).toFixed(0)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, vitamin_a: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">µg</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-none hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Vitamin C
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={(editedPlan?.vitamin_c ?? 0).toFixed(1)}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? { ...prev, vitamin_c: Number(e.target.value) }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">mg</span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* 5. Custom Nutrients (Conditionally Rendered) */}
      {customNutrients && customNutrients.length > 0 && (
        <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
          <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
            <h3 className="text-white font-bold text-sm">Custom Nutrients</h3>
          </div>
          <Table>
            <TableBody>
              {customNutrients.map((cn) => (
                <TableRow
                  key={cn.id}
                  className="border-gray-800 hover:bg-transparent"
                >
                  <TableCell className="font-medium text-gray-300 text-sm">
                    {cn.name}
                  </TableCell>
                  <TableCell className="text-right text-white font-bold">
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        step={0.1}
                        value={(editedPlan?.[cn.name] ?? 0).toFixed(1)}
                        onChange={(e) =>
                          setEditedPlan((prev) =>
                            prev
                              ? { ...prev, [cn.name]: Number(e.target.value) }
                              : null
                          )
                        }
                        className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                      />
                      <span className="text-sm">{cn.unit}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 6. Hydration & Exercise */}
      <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
        <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
          <h3 className="text-white font-bold text-sm">Hydration & Exercise</h3>
        </div>
        <div className="p-3 border-b border-gray-800 flex justify-center gap-2">
          {(['ml', 'oz', 'liter'] as const).map((unit) => (
            <button
              key={unit}
              onClick={() => setLocalWaterUnit(unit)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${localWaterUnit === unit ? 'bg-blue-600 text-white' : 'bg-[#2c2c2e] text-gray-400 hover:text-white'}`}
            >
              {unit}
            </button>
          ))}
        </div>
        <Table>
          <TableBody>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Water Goal
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step={0.1}
                    value={
                      editedPlan?.water_goal_ml
                        ? convertMlToSelectedUnit(
                            editedPlan.water_goal_ml,
                            localWaterUnit
                          ).toFixed(1)
                        : ''
                    }
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const ml = convertSelectedUnitToMl(val, localWaterUnit);
                      setEditedPlan((prev) =>
                        prev ? { ...prev, water_goal_ml: ml } : null
                      );
                    }}
                    className="w-20 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-xs">{localWaterUnit}</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-gray-800 hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Exercise Duration
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    value={editedPlan?.target_exercise_duration_minutes ?? ''}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? {
                              ...prev,
                              target_exercise_duration_minutes: Number(
                                e.target.value
                              ),
                            }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">min</span>
                </div>
              </TableCell>
            </TableRow>
            <TableRow className="border-none hover:bg-transparent">
              <TableCell className="font-medium text-gray-300 text-sm">
                Exercise Calories
              </TableCell>
              <TableCell className="text-right text-white font-bold">
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    value={editedPlan?.target_exercise_calories_burned ?? ''}
                    onChange={(e) =>
                      setEditedPlan((prev) =>
                        prev
                          ? {
                              ...prev,
                              target_exercise_calories_burned: Number(
                                e.target.value
                              ),
                            }
                          : null
                      )
                    }
                    className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                  />
                  <span className="text-sm">kcal</span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* 6. Meal Calorie Distribution */}
      <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
        <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
          <h3 className="text-white font-bold text-sm">
            {t('goals.mealDistribution.title', 'Meal Calorie Distribution')}
          </h3>
        </div>
        <div className="p-4 text-white dark">
          <MealPercentageManager
            initialPercentages={memoizedInitialPercentages}
            totalCalories={editedPlan?.calories || 2000}
            onPercentagesChange={handlePercentagesChange}
          />
        </div>
      </div>
    </div>
  );
};
