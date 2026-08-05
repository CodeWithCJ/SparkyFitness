import { X } from 'lucide-react';
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
import { NumericInput } from '../NumericInput';

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
    value: undefined | number | boolean | GlycemicIndex
  ) => void;
  /**
   * When supplied, each field gets a remove control. Used where the visible fields are
   * chosen by the user (the supplement nutrient picker) rather than fixed by the form.
   */
  onRemove?: (field: string) => void;
}

function gridId(variantIndex: number, key: string) {
  return `nutrient-${variantIndex}-${key}`;
}

function NutrientInput({
  id,
  label,
  value,
  step = '0.1',
  decimals,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  step?: string;
  decimals?: number;
  onChange: (val: number | undefined) => void;
}) {
  return (
    // Column with a growing label so the inputs of a row stay aligned even when a
    // long nutrient name ("Pantothenic Acid (B5)") wraps onto a second line.
    <div className="flex h-full flex-col gap-1">
      <Label htmlFor={id} className="flex-1">
        {label}
      </Label>
      <NumericInput
        id={id}
        step={step}
        // A nutrient amount is never negative, and both the food-variant and the
        // supplement payload schemas reject one. NumericInput only clamps when it
        // is given a min, so without this a typed "-5" reaches the API and 400s
        // the whole save.
        min="0"
        value={value}
        decimals={decimals}
        onValueChange={(value) => onChange(value)}
        placeholder="0"
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
  onRemove,
}: NutrientGridProps) {
  const { t } = useTranslation();
  // Auto-Scale (is_locked) controls whether changing the serving size rescales
  // the nutrition values; it no longer disables the inputs, so the user can
  // auto-scale and still edit any value directly. A manual edit re-captures the
  // scaling base in useFoodForm, so a later serving-size change scales from it.
  const update = (field: string) => (val: number | undefined) =>
    onUpdate(variantIndex, field, val);

  const renderField = (key: string) => {
    // --- Glycemic Index ---
    if (key === 'glycemic_index') {
      return (
        <div className="flex h-full flex-col gap-1">
          <Label
            htmlFor={gridId(variantIndex, 'glycemic_index')}
            className="flex-1"
          >
            Glycemic Index (GI)
          </Label>
          <Select
            value={variant.glycemic_index ?? 'None'}
            onValueChange={(val: GlycemicIndex) =>
              onUpdate(variantIndex, 'glycemic_index', val)
            }
          >
            <SelectTrigger id={gridId(variantIndex, 'glycemic_index')}>
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
          id={gridId(variantIndex, 'calories')}
          label={`Calories (${energyUnit})`}
          value={
            variant.calories !== undefined
              ? Math.round(
                  convertEnergy(variant.calories || 0, 'kcal', energyUnit)
                )
              : undefined
          }
          step="1"
          decimals={0}
          onChange={update('calories')}
        />
      );
    }

    // --- Standard Nutrients ---
    const cfg = CENTRAL_NUTRIENT_CONFIG[key];
    if (cfg) {
      return (
        <NutrientInput
          id={gridId(variantIndex, key)}
          label={`${t(cfg.label, { defaultValue: cfg.defaultLabel })} (${cfg.unit})`}
          value={variant[key as NumericFoodVariantKeys]}
          step={cfg.decimals === 0 ? '1' : '0.1'}
          decimals={cfg.decimals}
          onChange={update(key)}
        />
      );
    }

    // --- Custom Nutrients ---
    const cn = customNutrients?.find((n) => n.name === key);
    if (!cn) return null;
    const value = variant.custom_nutrients?.[cn.name];

    return (
      <NutrientInput
        id={gridId(variantIndex, key)}
        label={`${cn.name} (${cn.unit})`}
        value={typeof value === 'number' ? value : undefined}
        decimals={1}
        onChange={update(cn.name)}
      />
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {visibleNutrients.map((key) => {
        const field = renderField(key);
        if (!field) return null;
        if (!onRemove) return <div key={key}>{field}</div>;
        return (
          <div key={key} className="group relative">
            {field}
            <button
              type="button"
              onClick={() => onRemove(key)}
              aria-label={t('foods.removeNutrient', {
                defaultValue: 'Remove {{nutrient}}',
                nutrient: key,
              })}
              className="absolute right-0 top-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
