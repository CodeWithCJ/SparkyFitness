import { Input } from '@/components/ui/input';
import { ExpandedGoals } from '@/types/goals';
import { BasePlan } from '@/utils/nutritionCalculations';
import { useTranslation } from 'react-i18next';
import { FormData } from './OnBoardingForm';

export interface PersonalPlanHeaderProps {
  formData: FormData;
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  editedPlan: ExpandedGoals | null;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
  localEnergyUnit: 'kcal' | 'kJ';
  plan: BasePlan | null;
  setEditedPlan: React.Dispatch<React.SetStateAction<ExpandedGoals | null>>;
  setLocalEnergyUnit: React.Dispatch<React.SetStateAction<'kcal' | 'kJ'>>;
}
export const PersonalPlanHeader = ({
  convertEnergy,
  editedPlan,
  getEnergyUnitString,
  localEnergyUnit,
  plan,
  setEditedPlan,
  setLocalEnergyUnit,
  formData,
}: PersonalPlanHeaderProps) => {
  const { t } = useTranslation();
  return (
    <>
      <div className="bg-[#1c1c1e] rounded-2xl p-6 mb-6 text-center border border-gray-800">
        <div className="flex justify-center mb-6 bg-[#2c2c2e] p-1 rounded-lg w-fit mx-auto">
          <button
            onClick={() => {
              if (localEnergyUnit !== 'kcal' && editedPlan?.calories) {
                setEditedPlan((prev) =>
                  prev
                    ? {
                        ...prev,
                        calories: Math.round(
                          convertEnergy(prev.calories, 'kJ', 'kcal')
                        ),
                      }
                    : null
                );
              }
              setLocalEnergyUnit('kcal');
            }}
            className={`px-4 py-2 rounded-md transition-all ${localEnergyUnit === 'kcal' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
          >
            {t('settings.preferences.calories', 'Calories (kcal)')}
          </button>
          <button
            onClick={() => {
              if (localEnergyUnit !== 'kJ' && editedPlan?.calories) {
                setEditedPlan((prev) =>
                  prev
                    ? {
                        ...prev,
                        calories: Math.round(
                          convertEnergy(prev.calories, 'kcal', 'kJ')
                        ),
                      }
                    : null
                );
              }
              setLocalEnergyUnit('kJ');
            }}
            className={`px-4 py-2 rounded-md transition-all ${localEnergyUnit === 'kJ' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
          >
            {t('settings.preferences.joules', 'Joules (kJ)')}
          </button>
        </div>

        <p className="text-gray-400 uppercase text-sm font-bold tracking-wider mb-2">
          Daily Calorie Budget
        </p>
        <div className="text-6xl font-extrabold text-green-500 flex justify-center">
          <Input
            type="number"
            step={1}
            value={editedPlan?.calories ? editedPlan.calories.toFixed(0) : ''}
            onChange={(e) =>
              setEditedPlan((prev) =>
                prev ? { ...prev, calories: Number(e.target.value) } : null
              )
            }
            className="w-48 text-center bg-transparent border-none text-6xl text-green-500 font-extrabold focus-visible:ring-0 p-0 h-auto"
          />
        </div>
        <p className="text-xl text-white font-medium mt-1">
          {getEnergyUnitString(localEnergyUnit)} / day
        </p>

        <div className="mt-6 pt-6 border-t border-gray-800 flex justify-between text-sm text-gray-400">
          <span>
            Base BMR:{' '}
            {Math.round(convertEnergy(plan.bmr, 'kcal', localEnergyUnit))}{' '}
            {getEnergyUnitString(localEnergyUnit)}
          </span>

          <span>
            Calorie Buyback:{' '}
            <span
              className={
                formData.addBurnedCalories ? 'text-green-400' : 'text-gray-500'
              }
            >
              {formData.addBurnedCalories ? 'ON' : 'OFF'}
            </span>
          </span>
        </div>
      </div>
    </>
  );
};
