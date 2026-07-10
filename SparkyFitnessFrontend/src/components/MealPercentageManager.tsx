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
    id: 'even',
    values: { breakfast: 25, lunch: 25, dinner: 25, snacks: 25 },
  },
  {
    id: 'intermittentFasting',
    values: { breakfast: 0, lunch: 40, dinner: 40, snacks: 20 },
  },
  {
    id: 'proteinMorning',
    values: { breakfast: 40, lunch: 30, dinner: 20, snacks: 10 },
  },
  {
    id: 'noSnacks',
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

  const selectedTemplateId = useMemo(() => {
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
    return matchingTemplate ? matchingTemplate.id : 'custom';
  }, [initialPercentages]);

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? t('common.kcal') : t('common.kJ');
  };

  const calculateCalories = (percentage: number): number => {
    const caloriesInKcal = (percentage / 100) * totalCalories;
    return Math.round(convertEnergy(caloriesInKcal, 'kcal', energyUnit));
  };

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      if (templateId === 'custom') return;
      const template = distributionTemplates.find(
        (candidate) => candidate.id === templateId
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
      const clampedValue = Math.max(0, Math.min(100, value));
      const newPercentages = {
        ...initialPercentages,
        [meal]: clampedValue,
      };
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
      <div className="flex flex-col gap-4 sm:flex-row">
        <Select
          onValueChange={handleTemplateChange}
          value={selectedTemplateId}
          disabled={hasCustomMeals}
        >
          <SelectTrigger
            className="text-start"
            aria-label={t('goals.mealDistribution.selectTemplate')}
          >
            <SelectValue
              placeholder={t('goals.mealDistribution.selectTemplate')}
            />
          </SelectTrigger>
          <SelectContent>
            {selectedTemplateId === 'custom' && (
              <SelectItem value="custom" disabled>
                {t('goals.mealDistribution.custom')}
              </SelectItem>
            )}
            {!hasCustomMeals &&
              distributionTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {t(`goals.mealDistribution.templates.${template.id}`)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={distributeRemaining}
          variant="outline"
          className="w-full sm:w-auto"
        >
          {t('goals.mealDistribution.distributeRemaining')}
        </Button>
      </div>

      {Object.keys(initialPercentages).map((meal) => {
        const mealPercentage = initialPercentages[meal] ?? 0;
        const mealLabel = t(`common.${meal}`, { defaultValue: meal });
        const lockLabel = t(
          locks[meal]
            ? 'goals.mealDistribution.unlockMeal'
            : 'goals.mealDistribution.lockMeal',
          { meal: mealLabel }
        );
        const percentageLabel = t('goals.mealDistribution.mealPercentage', {
          meal: mealLabel,
        });
        const inputId = `meal-percentage-${meal}`;

        return (
          <div key={meal} className="space-y-2">
            <Label htmlFor={inputId} className="font-semibold">
              {t('goals.mealDistribution.mealEnergy', {
                meal: mealLabel,
                calories: calculateCalories(mealPercentage),
                unit: getEnergyUnitString(energyUnit),
              })}
            </Label>
            <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleLockToggle(meal)}
                aria-label={lockLabel}
                title={lockLabel}
                aria-pressed={Boolean(locks[meal])}
              >
                {locks[meal] ? (
                  <Lock className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Unlock className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[mealPercentage]}
                onValueChange={([value]) =>
                  handleSliderChange(meal, value || 0)
                }
                disabled={locks[meal]}
                className="min-w-40 flex-1"
                aria-label={percentageLabel}
              />
              <div className="ms-auto flex items-center gap-2" dir="ltr">
                <Input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  value={mealPercentage}
                  onChange={(event) =>
                    handleSliderChange(
                      meal,
                      Number.parseInt(event.target.value, 10) || 0
                    )
                  }
                  className="w-20 text-end"
                  disabled={locks[meal]}
                  aria-label={percentageLabel}
                />
                <span className="text-sm font-medium">%</span>
              </div>
            </div>
          </div>
        );
      })}

      <div
        className={`text-end font-semibold ${
          totalPercentage === 100
            ? 'text-green-700 dark:text-green-400'
            : 'text-destructive'
        }`}
        role="status"
        aria-live="polite"
      >
        {t('goals.mealDistribution.totalWithPercentage', {
          total: totalPercentage,
        })}
        {totalPercentage !== 100 && (
          <p className="text-sm font-normal">
            {t('goals.mealDistribution.mustBe100')}
          </p>
        )}
      </div>
    </div>
  );
};

export default MealPercentageManager;
