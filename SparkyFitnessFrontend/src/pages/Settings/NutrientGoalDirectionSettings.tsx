import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import {
  useNutrientGoalPreferences,
  useUpdateNutrientGoalPreferenceMutation,
  useResetNutrientGoalPreferenceMutation,
} from '@/hooks/Settings/useNutrientGoalPreferences';
import {
  CENTRAL_NUTRIENT_CONFIG,
  PREDEFINED_NUTRIENT_KEYS,
  NutrientGoalType,
} from '@/constants/nutrients';
import { RotateCcw } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';

function getNutrientLabel(
  key: string,
  t: (key: string, defaultValue: string) => string
) {
  const config = CENTRAL_NUTRIENT_CONFIG[key];
  if (config) return t(config.label, config.defaultLabel);
  return key;
}

interface NutrientGoalDirectionRowProps {
  nutrientKey: string;
  unit: string;
  goalType: NutrientGoalType;
  targetMin?: number;
  targetMax?: number;
}

const NutrientGoalDirectionRow = ({
  nutrientKey,
  unit,
  goalType,
  targetMin,
  targetMax,
}: NutrientGoalDirectionRowProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  const { mutate: updatePreference } =
    useUpdateNutrientGoalPreferenceMutation();
  const { mutate: resetPreference } = useResetNutrientGoalPreferenceMutation();

  const isCalories = nutrientKey === 'calories';

  // If isCalories and energyUnit is kJ, convert targetMin/targetMax from kcal to kJ for display
  const initialMin =
    targetMin !== undefined
      ? isCalories
        ? Math.round(convertEnergy(targetMin, 'kcal', energyUnit))
        : targetMin
      : undefined;

  const initialMax =
    targetMax !== undefined
      ? isCalories
        ? Math.round(convertEnergy(targetMax, 'kcal', energyUnit))
        : targetMax
      : undefined;

  // The Select is driven by this local, uncommitted selection rather than
  // directly by the saved `goalType` prop: choosing "Target range" has
  // nothing to persist yet (the band is empty), so if the Select were bound
  // straight to the prop it would silently snap back since the mutation
  // never fires. Local state lets the dropdown reflect the choice immediately
  // and reveal the band inputs. The parent remounts this row (via a key that
  // includes goalType/targetMin/targetMax) whenever the saved preference
  // actually changes, so these initializers stay in sync with the server
  // without needing an effect to resync them.
  const [localGoalType, setLocalGoalType] =
    useState<NutrientGoalType>(goalType);
  const [localMin, setLocalMin] = useState<string>(
    initialMin !== undefined ? String(initialMin) : ''
  );
  const [localMax, setLocalMax] = useState<string>(
    initialMax !== undefined ? String(initialMax) : ''
  );

  const handleGoalTypeChange = (value: NutrientGoalType) => {
    setLocalGoalType(value);
    if (value === 'target') {
      const min = parseFloat(localMin);
      const max = parseFloat(localMax);
      if (isNaN(min) || isNaN(max) || min > max) {
        // Show the band inputs and wait for the user to fill in a valid
        // range before saving — nothing to persist yet.
        return;
      }
      const dbMin = isCalories ? convertEnergy(min, energyUnit, 'kcal') : min;
      const dbMax = isCalories ? convertEnergy(max, energyUnit, 'kcal') : max;
      updatePreference({
        nutrientKey,
        goalType: 'target',
        targetMin: dbMin,
        targetMax: dbMax,
      });
    } else {
      updatePreference({ nutrientKey, goalType: value });
    }
  };

  const handleBandSave = () => {
    const min = parseFloat(localMin);
    const max = parseFloat(localMax);
    if (isNaN(min) || isNaN(max) || min > max) return;
    const dbMin = isCalories ? convertEnergy(min, energyUnit, 'kcal') : min;
    const dbMax = isCalories ? convertEnergy(max, energyUnit, 'kcal') : max;
    updatePreference({
      nutrientKey,
      goalType: 'target',
      targetMin: dbMin,
      targetMax: dbMax,
    });
  };

  const bandInvalid =
    localGoalType === 'target' &&
    (localMin === '' ||
      localMax === '' ||
      isNaN(parseFloat(localMin)) ||
      isNaN(parseFloat(localMax)) ||
      parseFloat(localMin) > parseFloat(localMax));

  return (
    <div className="flex flex-wrap items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/50">
      <Label className="w-40 shrink-0">
        {getNutrientLabel(nutrientKey, t)}
      </Label>
      <Select value={localGoalType} onValueChange={handleGoalTypeChange}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minimum">
            {t('nutrientGoalDirection.minimum', 'Minimum (more is better)')}
          </SelectItem>
          <SelectItem value="maximum">
            {t('nutrientGoalDirection.maximum', 'Maximum (stay under)')}
          </SelectItem>
          <SelectItem value="target">
            {t('nutrientGoalDirection.target', 'Target range')}
          </SelectItem>
        </SelectContent>
      </Select>

      {localGoalType === 'target' && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-24"
            placeholder={t('nutrientGoalDirection.min', 'Min')}
            value={localMin}
            onChange={(e) => setLocalMin(e.target.value)}
            onBlur={handleBandSave}
          />
          <span className="text-muted-foreground text-sm">
            {t('nutrientGoalDirection.to', 'to')}
          </span>
          <Input
            type="number"
            className="w-24"
            placeholder={t('nutrientGoalDirection.max', 'Max')}
            value={localMax}
            onChange={(e) => setLocalMax(e.target.value)}
            onBlur={handleBandSave}
          />
          <span className="text-sm text-muted-foreground">
            {isCalories
              ? energyUnit === 'kcal'
                ? t('common.kcalUnit', 'kcal')
                : t('common.kJUnit', 'kJ')
              : unit}
          </span>
          {bandInvalid && (
            <span className="text-xs text-destructive">
              {t(
                'nutrientGoalDirection.invalidBand',
                'Enter a valid min ≤ max'
              )}
            </span>
          )}
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        title={t('nutrientGoalDirection.resetToDefault', 'Reset to default')}
        onClick={() => resetPreference(nutrientKey)}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
};

const NutrientGoalDirectionSettings = () => {
  const { t } = useTranslation();
  const { energyUnit } = usePreferences();
  const { data: customNutrients = [] } = useCustomNutrients();
  const { data: goalPreferences = {} } = useNutrientGoalPreferences();

  const allNutrientKeys = useMemo(
    () => [
      ...PREDEFINED_NUTRIENT_KEYS,
      ...customNutrients.map((cn) => cn.name),
    ],
    [customNutrients]
  );

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground mb-2">
        {t(
          'nutrientGoalDirection.description',
          "Choose how progress toward each nutrient's daily goal is judged: a minimum to reach, a maximum to stay under, or a target range to hit."
        )}
      </p>
      {allNutrientKeys.map((key) => {
        const unit =
          CENTRAL_NUTRIENT_CONFIG[key]?.unit ??
          customNutrients.find((cn) => cn.name === key)?.unit ??
          '';
        const preference = goalPreferences[key];
        const goalType: NutrientGoalType =
          preference?.goalType ??
          CENTRAL_NUTRIENT_CONFIG[key]?.defaultGoalType ??
          'minimum';
        return (
          <NutrientGoalDirectionRow
            key={`${key}-${goalType}-${preference?.targetMin}-${preference?.targetMax}-${energyUnit}`}
            nutrientKey={key}
            unit={unit}
            goalType={goalType}
            targetMin={preference?.targetMin}
            targetMax={preference?.targetMax}
          />
        );
      })}
    </div>
  );
};

export default NutrientGoalDirectionSettings;
