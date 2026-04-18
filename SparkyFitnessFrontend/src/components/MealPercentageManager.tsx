import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lock, Unlock } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';

export type MealPercentages = Record<string, number>;

interface MealPercentageManagerProps {
  initialPercentages: MealPercentages;
  onPercentagesChange: (percentages: MealPercentages) => void;
  totalCalories: number;
}

const distributionTemplates = [
  {
    name: 'Even Distribution',
    values: { breakfast: 25, lunch: 25, dinner: 25, snacks: 25 },
  },
  {
    name: 'Intermittent Fasting',
    values: { breakfast: 0, lunch: 40, dinner: 40, snacks: 20 },
  },
  {
    name: 'Protein-Focused Morning',
    values: { breakfast: 40, lunch: 30, dinner: 20, snacks: 10 },
  },
  {
    name: 'No Snacks',
    values: { breakfast: 30, lunch: 40, dinner: 30, snacks: 0 },
  },
];

const MealPercentageManager = ({
  initialPercentages,
  onPercentagesChange,
  totalCalories,
}: MealPercentageManagerProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();

  const [locks, setLocks] = useState<Record<string, boolean>>({});

  const selectedTemplateName = useMemo(() => {
    const matchingTemplate = distributionTemplates.find((tpl) => {
      const tplKeys = Object.keys(tpl.values);
      const curKeys = Object.keys(initialPercentages);
      if (tplKeys.length !== curKeys.length) return false;
      const keysMatch = tplKeys.every((k) => curKeys.includes(k));
      return (
        keysMatch &&
        JSON.stringify(tpl.values) === JSON.stringify(initialPercentages)
      );
    });
    return matchingTemplate ? matchingTemplate.name : 'Custom';
  }, [initialPercentages]);

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };

  const calculateCalories = (percentage: number): number => {
    const caloriesInKcal = (percentage / 100) * totalCalories;
    return Math.round(convertEnergy(caloriesInKcal, 'kcal', energyUnit));
  };

  const handleTemplateChange = useCallback(
    (templateName: string) => {
      if (templateName === 'Custom') return;
      const template = distributionTemplates.find(
        (tpl) => tpl.name === templateName
      );
      if (template) {
        const newValues = { ...template.values };
        setLocks({}); // Clear locks when applying a new template
        onPercentagesChange(newValues);
      }
    },
    [onPercentagesChange]
  );

  const handleSliderChange = useCallback(
    (meal: string, value: number) => {
      // Create a new object with the updated value and send it straight to the parent
      const newPercentages = { ...initialPercentages, [meal]: value };
      onPercentagesChange(newPercentages);
    },
    [initialPercentages, onPercentagesChange]
  );

  const handleLockToggle = useCallback((meal: string) => {
    setLocks((prevLocks) => ({ ...prevLocks, [meal]: !prevLocks[meal] }));
  }, []);

  const distributeRemaining = useCallback(() => {
    const lockedTotal = Object.keys(locks).reduce((acc, key) => {
      return locks[key] ? acc + (initialPercentages[key] ?? 0) : acc;
    }, 0);

    const unlockedMeals = Object.keys(initialPercentages).filter(
      (key) => !locks[key]
    );
    let remainingToDistribute = 100 - lockedTotal;

    if (unlockedMeals.length > 0) {
      const newPercentages = { ...initialPercentages };

      unlockedMeals.forEach((m, index) => {
        if (index === unlockedMeals.length - 1) {
          // Give the exact remainder to the last unlocked meal to prevent rounding drift
          newPercentages[m] = Math.max(0, remainingToDistribute);
        } else {
          // Divide evenly and round
          const share = Math.round((100 - lockedTotal) / unlockedMeals.length);
          newPercentages[m] = Math.max(0, share);
          remainingToDistribute -= share;
        }
      });

      onPercentagesChange(newPercentages);
    }
  }, [initialPercentages, locks, onPercentagesChange]);

  const totalPercentage = Object.values(initialPercentages).reduce(
    (sum, p) => sum + Number(p ?? 0),
    0
  );

  const hasCustomMeals = useMemo(() => {
    const templateKeys = Object.keys(distributionTemplates[0]?.values ?? {});
    const currentKeys = Object.keys(initialPercentages);
    return (
      currentKeys.length !== templateKeys.length ||
      !currentKeys.every((k) => templateKeys.includes(k))
    );
  }, [initialPercentages]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <Select
          onValueChange={handleTemplateChange}
          value={selectedTemplateName}
          disabled={hasCustomMeals}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={t('goals.mealDistribution.selectTemplate')}
            />
          </SelectTrigger>
          <SelectContent>
            {selectedTemplateName === 'Custom' && (
              <SelectItem value="Custom" disabled>
                {t('goals.mealDistribution.custom')}
              </SelectItem>
            )}
            {!hasCustomMeals &&
              distributionTemplates.map((template) => (
                <SelectItem key={template.name} value={template.name}>
                  {template.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          onClick={distributeRemaining}
          variant="outline"
          className="w-full sm:w-auto"
        >
          {t('goals.mealDistribution.distributeRemaining')}
        </Button>
      </div>

      {Object.keys(initialPercentages).map((meal) => {
        const mealPercentage = initialPercentages[meal] ?? 0;

        return (
          <div key={meal} className="space-y-2">
            <Label htmlFor={meal} className="capitalize font-semibold">
              {t(`common.${meal}`, meal)} ({calculateCalories(mealPercentage)}{' '}
              {getEnergyUnitString(energyUnit)})
            </Label>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleLockToggle(meal)}
              >
                {locks[meal] ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Unlock className="w-4 h-4" />
                )}
              </Button>
              <Slider
                id={meal}
                min={0}
                max={100}
                step={1}
                value={[mealPercentage]}
                onValueChange={([value]) =>
                  handleSliderChange(meal, value || 0)
                }
                disabled={locks[meal]}
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={mealPercentage}
                  onChange={(e) =>
                    handleSliderChange(meal, parseInt(e.target.value, 10) || 0)
                  }
                  className="w-20"
                  disabled={locks[meal]}
                />
                <span className="text-sm font-medium">%</span>
              </div>
            </div>
          </div>
        );
      })}

      <div
        className={`text-right font-semibold ${
          totalPercentage === 100 ? 'text-green-600' : 'text-red-600'
        }`}
      >
        {t('goals.mealDistribution.total')}: {totalPercentage}%
        {totalPercentage !== 100 && (
          <p className="text-sm font-normal">
            ({t('goals.mealDistribution.mustBe100')})
          </p>
        )}
      </div>
    </div>
  );
};

export default MealPercentageManager;
