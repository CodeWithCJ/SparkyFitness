import { Input } from '@/components/ui/input';
import { ChevronLeft, Utensils, Lock, Unlock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { DIET_TEMPLATES, getDietTemplate } from '@/constants/dietTemplates';

export interface DietApproachProps {
  customPercentages: { carbs: number; protein: number; fat: number };
  handleMacroValueChange: (
    changedMacro: 'carbs' | 'protein' | 'fat',
    newValue: number
  ) => void;
  localSelectedDiet: string;
  lockedMacros: { carbs: boolean; protein: boolean; fat: boolean };
  setCustomPercentages: React.Dispatch<
    React.SetStateAction<{ carbs: number; protein: number; fat: number }>
  >;
  setLocalSelectedDiet: React.Dispatch<React.SetStateAction<string>>;
  setLockedMacros: React.Dispatch<
    React.SetStateAction<{ carbs: boolean; protein: boolean; fat: boolean }>
  >;
  setShowDietApproach: React.Dispatch<React.SetStateAction<boolean>>;
  showDietApproach: boolean;
}

export const DietApproach = ({
  customPercentages,
  handleMacroValueChange,
  localSelectedDiet,
  lockedMacros,
  setCustomPercentages,
  setLocalSelectedDiet,
  setLockedMacros,
  setShowDietApproach,
  showDietApproach,
}: DietApproachProps) => {
  return (
    <div className="bg-[#1c1c1e] rounded-2xl border border-gray-800 mb-6">
      <button
        onClick={() => setShowDietApproach(!showDietApproach)}
        className="w-full p-4 flex items-center justify-between hover:bg-[#2c2c2e] transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-2">
          <Utensils className="h-5 w-5 text-green-500" />
          <span className="text-white font-semibold">Diet Approach</span>
        </div>
        <ChevronLeft
          className={`h-5 w-5 text-gray-400 transition-transform ${showDietApproach ? '-rotate-90' : 'rotate-180'}`}
        />
      </button>

      {showDietApproach && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-4">
          <p className="text-gray-400 text-sm mb-4">
            Choose a preset diet or customize your macro split
          </p>

          <Select
            value={localSelectedDiet}
            onValueChange={(value) => {
              setLocalSelectedDiet(value);
              if (value !== 'custom') {
                const template = getDietTemplate(value);
                setCustomPercentages({
                  carbs: template.carbsPercentage,
                  protein: template.proteinPercentage,
                  fat: template.fatPercentage,
                });
              }
            }}
          >
            <SelectTrigger className="w-full bg-[#2c2c2e] border-gray-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIET_TEMPLATES.map((diet) => (
                <SelectItem key={diet.id} value={diet.id}>
                  <div>
                    <div className="font-semibold">{diet.name}</div>
                    <div className="text-xs text-gray-400">
                      {diet.carbsPercentage}% Carbs / {diet.proteinPercentage}%
                      Protein / {diet.fatPercentage}% Fat
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mt-3 p-3 bg-[#2c2c2e] rounded-lg">
            <p className="text-sm text-gray-300">
              {getDietTemplate(localSelectedDiet).description}
            </p>
          </div>

          {localSelectedDiet === 'custom' && (
            <div className="mt-6 space-y-6 p-4 bg-[#2c2c2e] rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-white">
                  Custom Macro Split
                </h4>
                <span
                  className={`text-sm font-mono ${
                    Math.round(customPercentages.carbs) +
                      Math.round(customPercentages.protein) +
                      Math.round(customPercentages.fat) ===
                    100
                      ? 'text-green-500'
                      : 'text-yellow-500'
                  }`}
                >
                  Total:{' '}
                  {Math.round(customPercentages.carbs) +
                    Math.round(customPercentages.protein) +
                    Math.round(customPercentages.fat)}
                  %
                </span>
              </div>

              {/* Carbs */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setLockedMacros((p) => ({ ...p, carbs: !p.carbs }))
                      }
                      className="text-gray-400 hover:text-white"
                    >
                      {lockedMacros.carbs ? (
                        <Lock size={16} />
                      ) : (
                        <Unlock size={16} />
                      )}
                    </button>
                    <label className="text-sm font-medium text-gray-300">
                      Carbohydrates
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step={1}
                      value={Math.round(customPercentages.carbs).toFixed(0)}
                      onChange={(e) =>
                        handleMacroValueChange(
                          'carbs',
                          parseInt(e.target.value, 10) || 0
                        )
                      }
                      className="w-20 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                      disabled={lockedMacros.carbs}
                    />
                    <span className="text-sm font-mono text-white">%</span>
                  </div>
                </div>
                <Slider
                  value={[customPercentages.carbs]}
                  onValueChange={([value]) =>
                    handleMacroValueChange('carbs', value)
                  }
                  min={5}
                  max={80}
                  step={1}
                  className="cursor-pointer"
                  disabled={lockedMacros.carbs}
                />
              </div>

              {/* Protein */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setLockedMacros((p) => ({
                          ...p,
                          protein: !p.protein,
                        }))
                      }
                      className="text-gray-400 hover:text-white"
                    >
                      {lockedMacros.protein ? (
                        <Lock size={16} />
                      ) : (
                        <Unlock size={16} />
                      )}
                    </button>
                    <label className="text-sm font-medium text-gray-300">
                      Protein
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step={1}
                      value={Math.round(customPercentages.protein).toFixed(0)}
                      onChange={(e) =>
                        handleMacroValueChange(
                          'protein',
                          parseInt(e.target.value, 10) || 0
                        )
                      }
                      className="w-20 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                      disabled={lockedMacros.protein}
                    />
                    <span className="text-sm font-mono text-white">%</span>
                  </div>
                </div>
                <Slider
                  value={[customPercentages.protein]}
                  onValueChange={([value]) =>
                    handleMacroValueChange('protein', value)
                  }
                  min={10}
                  max={50}
                  step={1}
                  className="cursor-pointer"
                  disabled={lockedMacros.protein}
                />
              </div>

              {/* Fat */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setLockedMacros((p) => ({ ...p, fat: !p.fat }))
                      }
                      className="text-gray-400 hover:text-white"
                    >
                      {lockedMacros.fat ? (
                        <Lock size={16} />
                      ) : (
                        <Unlock size={16} />
                      )}
                    </button>
                    <label className="text-sm font-medium text-gray-300">
                      Fat
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step={1}
                      value={Math.round(customPercentages.fat).toFixed(0)}
                      onChange={(e) =>
                        handleMacroValueChange(
                          'fat',
                          parseInt(e.target.value, 10) || 0
                        )
                      }
                      className="w-20 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                      disabled={lockedMacros.fat}
                    />
                    <span className="text-sm font-mono text-white">%</span>
                  </div>
                </div>
                <Slider
                  value={[customPercentages.fat]}
                  onValueChange={([value]) =>
                    handleMacroValueChange('fat', value)
                  }
                  min={10}
                  max={75}
                  step={1}
                  className="cursor-pointer"
                  disabled={lockedMacros.fat}
                />
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Adjust or type in a value. Unlocked macros will auto-adjust to
                maintain 100% total.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
