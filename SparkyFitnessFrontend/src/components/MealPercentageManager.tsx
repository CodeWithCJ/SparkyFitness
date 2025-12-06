import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock, Unlock } from 'lucide-react';
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences

interface MealPercentages {
  breakfast: number;
  lunch: number;
  dinner: number;
  snacks: number;
}

interface MealPercentageManagerProps {
  initialPercentages: MealPercentages;
  onPercentagesChange: (percentages: MealPercentages) => void;
  totalCalories: number;
}

const distributionTemplates = [
  { name: 'Even Distribution', values: { breakfast: 25, lunch: 25, dinner: 25, snacks: 25 } },
  { name: 'Intermittent Fasting', values: { breakfast: 0, lunch: 40, dinner: 40, snacks: 20 } },
  { name: 'Protein-Focused Morning', values: { breakfast: 40, lunch: 30, dinner: 20, snacks: 10 } },
  { name: 'No Snacks', values: { breakfast: 30, lunch: 40, dinner: 30, snacks: 0 } },
];

const MealPercentageManager = ({ initialPercentages, onPercentagesChange, totalCalories }: MealPercentageManagerProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  const [percentages, setPercentages] = useState<MealPercentages>(initialPercentages);
  const [locks, setLocks] = useState({ breakfast: false, lunch: false, dinner: false, snacks: false });
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? t('common.kcalUnit', 'kcal') : t('common.kJUnit', 'kJ');
  };

  // Calculate calories for a given percentage
  const calculateCalories = (percentage: number): number => {
    // totalCalories is assumed to be in kcal
    const caloriesInKcal = (percentage / 100) * totalCalories;
    return Math.round(convertEnergy(caloriesInKcal, 'kcal', energyUnit)); // Return converted value for display
  };

  useEffect(() => {
    const matchingTemplate = distributionTemplates.find(t =>
      JSON.stringify(t.values) === JSON.stringify(percentages)
    );
    if (matchingTemplate) {
        setSelectedTemplateName(matchingTemplate.name);
    } else {
        setSelectedTemplateName('Custom');
    }
  }, [percentages]);

  useEffect(() => {
    onPercentagesChange(percentages);
  }, [percentages, onPercentagesChange]);

  const handleTemplateChange = (templateName: string) => {
    if (templateName === 'Custom') return;
    const template = distributionTemplates.find(t => t.name === templateName);
    if (template) {
      setPercentages(template.values);
      setLocks({ breakfast: false, lunch: false, dinner: false, snacks: false });
    }
  };

  const handleSliderChange = (meal: keyof MealPercentages, value: number) => {
    const newPercentages = { ...percentages, [meal]: value };
    autoBalance(newPercentages, meal);
  };

  const handleLockToggle = (meal: keyof MealPercentages) => {
    setLocks(prevLocks => ({ ...prevLocks, [meal]: !prevLocks[meal] }));
  };

  const autoBalance = (currentPercentages: MealPercentages, changedMeal: keyof MealPercentages) => {
    if (selectedTemplateName === 'Custom') {
      setPercentages(currentPercentages);
      return;
    }
    const lockedTotal = Object.keys(locks).reduce((acc, key) => {
      return locks[key as keyof MealPercentages] && key !== changedMeal ? acc + currentPercentages[key as keyof MealPercentages] : acc;
    }, 0);

    const unlockedMeals = Object.keys(locks).filter(key => !locks[key as keyof MealPercentages] && key !== changedMeal) as (keyof MealPercentages)[];
    const changedValue = currentPercentages[changedMeal];
    const remainingToDistribute = 100 - lockedTotal - changedValue;

    if (unlockedMeals.length > 0) {
      const perMealShare = remainingToDistribute / unlockedMeals.length;
      unlockedMeals.forEach(m => {
        currentPercentages[m] = perMealShare;
      });
    }
    setPercentages(normalizePercentages(currentPercentages, changedMeal));
  };
  
  const distributeRemaining = () => {
    const lockedTotal = Object.keys(locks).reduce((acc, key) => {
        return locks[key as keyof MealPercentages] ? acc + percentages[key as keyof MealPercentages] : acc;
    }, 0);

    const unlockedMeals = Object.keys(locks).filter(key => !locks[key as keyof MealPercentages]) as (keyof MealPercentages)[];
    const remainingToDistribute = 100 - lockedTotal;

    if (unlockedMeals.length > 0) {
        const perMealShare = remainingToDistribute / unlockedMeals.length;
        const newPercentages = { ...percentages };
        unlockedMeals.forEach(m => {
            newPercentages[m] = perMealShare;
        });
        setPercentages(normalizePercentages(newPercentages));
    }
  };

  const normalizePercentages = (currentPercentages: MealPercentages, changedMeal?: keyof MealPercentages) => {
    const total = Object.values(currentPercentages).reduce((sum, p) => sum + p, 0);
    if (Math.round(total) !== 100) {
        const diff = 100 - total;
        const unlockedMeals = Object.keys(locks).filter(key => !locks[key as keyof MealPercentages] && key !== changedMeal) as (keyof MealPercentages)[];
        if (unlockedMeals.length > 0) {
            const adjustment = diff / unlockedMeals.length;
            unlockedMeals.forEach(m => {
                currentPercentages[m] += adjustment;
            });
        }
    }
    // Round to nearest integer and ensure sum is exactly 100
    let roundedTotal = 0;
    const finalPercentages = { ...currentPercentages };
    (Object.keys(finalPercentages) as (keyof MealPercentages)[]).forEach(m => {
        finalPercentages[m] = Math.round(finalPercentages[m]);
        roundedTotal += finalPercentages[m];
    });

    // Adjust for rounding errors
    let roundingDiff = 100 - roundedTotal;
    const unlockedMeals = Object.keys(locks).filter(key => !locks[key as keyof MealPercentages] && key !== changedMeal) as (keyof MealPercentages)[];
    if(unlockedMeals.length > 0) {
        let i = 0;
        while(roundingDiff !== 0) {
            const mealToAdjust = unlockedMeals[i % unlockedMeals.length];
            const adjustment = Math.sign(roundingDiff);
            finalPercentages[mealToAdjust] += adjustment;
            roundingDiff -= adjustment;
            i++;
        }
    }

    return finalPercentages;
  };

  const totalPercentage = Object.values(percentages).reduce((sum, p) => sum + Number(p), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <Select onValueChange={handleTemplateChange} value={selectedTemplateName}>
          <SelectTrigger>
            <SelectValue placeholder={t('goals.mealDistribution.selectTemplate')} />
          </SelectTrigger>
          <SelectContent>
            {selectedTemplateName === 'Custom' && <SelectItem value="Custom" disabled>{t('goals.mealDistribution.custom')}</SelectItem>}
            {distributionTemplates.map(template => (
              <SelectItem key={template.name} value={template.name}>{template.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={distributeRemaining} variant="outline" className="w-full sm:w-auto">{t('goals.mealDistribution.distributeRemaining')}</Button>
      </div>

      {(Object.keys(percentages) as Array<keyof MealPercentages>).map(meal => (
        <div key={meal} className="space-y-2">
          <Label htmlFor={meal} className="capitalize font-semibold">
            {t(`common.${meal}`)} ({calculateCalories(percentages[meal])} {getEnergyUnitString(energyUnit)})
          </Label>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => handleLockToggle(meal)}>
              {locks[meal] ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </Button>
            <Slider
              id={meal}
              min={0}
              max={100}
              step={1}
              value={[percentages[meal]]}
              onValueChange={([value]) => handleSliderChange(meal, value)}
              disabled={locks[meal]}
            />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={percentages[meal]}
                onChange={(e) => handleSliderChange(meal, parseInt(e.target.value, 10) || 0)}
                className="w-20"
                disabled={locks[meal]}
              />
              <span className="text-sm font-medium">%</span>
            </div>
          </div>
        </div>
      ))}

      <div className={`text-right font-semibold ${totalPercentage === 100 ? 'text-green-600' : 'text-red-600'}`}>
        {t('goals.mealDistribution.total')}: {totalPercentage}%
        {totalPercentage !== 100 && <p className="text-sm font-normal">({t('goals.mealDistribution.mustBe100')})</p>}
      </div>
    </div>
  );
};

export default MealPercentageManager;