import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';
import { UserCustomNutrient } from '@/types/customNutrient';
import type { GlycemicIndex, NumericFoodVariantKeys } from '@/types/food';
import type { FormFoodVariant } from '@/utils/foodForm';
import { useTranslation } from 'react-i18next';

const GLYCEMIC_INDEX_OPTIONS: { value: GlycemicIndex; label: string }[] = [
  { value: 'None', label: 'None' },
  { value: 'Very Low', label: 'Very Low' },
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
  { value: 'Very High', label: 'Very High' },
];

interface NutrientGridProps {
  variantIndex: number;
  variant: FormFoodVariant;
  visibleNutrients: string[];
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    from: 'kcal' | 'kJ',
    to: 'kcal' | 'kJ'
  ) => number;
  customNutrients?: UserCustomNutrient[];
  onUpdate: (
    index: number,
    field: string,
    value: string | number | boolean | GlycemicIndex
  ) => void;
}

function gridId(variantIndex: number, key: string) {
  return `nutrient-${variantIndex}-${key}`;
}

function NutrientInput({
  id,
  label,
  value,
  step = '0.1',
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string | number;
  step?: string;
  disabled: boolean;
  onChange: (val: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        disabled={disabled}
      />
    </div>
  );
}

export function NutrientGrid({
  variantIndex,
  variant,
  visibleNutrients,
  energyUnit,
  convertEnergy,
  customNutrients,
  onUpdate,
}: NutrientGridProps) {
  const { t } = useTranslation();
  const isLocked = variant.is_locked ?? false;
  const update = (field: string) => (val: string) =>
    onUpdate(variantIndex, field, val);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {visibleNutrients.map((key) => {
        // --- Glycemic Index ---
        if (key === 'glycemic_index') {
          return (
            <div key="glycemic_index">
              <Label htmlFor={gridId(variantIndex, 'glycemic_index')}>
                Glycemic Index (GI)
              </Label>
              <Select
                value={variant.glycemic_index ?? 'None'}
                onValueChange={(val: GlycemicIndex) =>
                  onUpdate(variantIndex, 'glycemic_index', val)
                }
              >
                <SelectTrigger
                  id={gridId(variantIndex, 'glycemic_index')}
                  disabled={isLocked}
                >
                  <SelectValue placeholder="Select GI" />
                </SelectTrigger>
                <SelectContent>
                  {GLYCEMIC_INDEX_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        // --- Calories ---
        if (key === 'calories') {
          return (
            <NutrientInput
              key="calories"
              id={gridId(variantIndex, 'calories')}
              label={`Calories (${energyUnit})`}
              value={
                variant.calories === ''
                  ? ''
                  : Math.round(
                      convertEnergy(variant.calories || 0, 'kcal', energyUnit)
                    )
              }
              step="1"
              disabled={isLocked}
              onChange={update('calories')}
            />
          );
        }

        // --- Standard Nutrients ---
        const cfg = CENTRAL_NUTRIENT_CONFIG[key];
        if (cfg) {
          return (
            <NutrientInput
              key={key}
              id={gridId(variantIndex, key)}
              label={`${t(cfg.label, { defaultValue: cfg.defaultLabel })} (${cfg.unit})`}
              value={variant[key as NumericFoodVariantKeys] ?? ''}
              step={cfg.decimals === 0 ? '1' : '0.1'}
              disabled={isLocked}
              onChange={update(key)}
            />
          );
        }

        // --- Custom Nutrients ---
        const cn = customNutrients?.find((n) => n.name === key);
        if (!cn) return null;

        return (
          <NutrientInput
            key={key}
            id={gridId(variantIndex, key)}
            label={`${cn.name} (${cn.unit})`}
            value={variant.custom_nutrients?.[cn.name] ?? ''}
            disabled={isLocked}
            onChange={update(cn.name)}
          />
        );
      })}
    </div>
  );
}
