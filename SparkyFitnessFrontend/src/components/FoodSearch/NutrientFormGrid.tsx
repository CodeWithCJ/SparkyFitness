import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserCustomNutrient } from '@/types/customNutrient';
import type { GlycemicIndex, NumericFoodVariantKeys } from '@/types/food';
import type { FormFoodVariant } from '@/utils/foodForm';

// ─── Section config ───────────────────────────────────────────────────────────

interface NutrientFieldConfig {
  key: NumericFoodVariantKeys;
  label: string;
  unit: string;
  step?: string;
}

interface NutrientSection {
  title: string;
  fields: NutrientFieldConfig[];
}

const NUTRIENT_SECTIONS: NutrientSection[] = [
  {
    title: 'Main Nutrients',
    fields: [
      // calories is handled separately (energy unit conversion) — excluded here
      { key: 'protein', label: 'Protein', unit: 'g', step: '0.1' },
      { key: 'carbs', label: 'Carbs', unit: 'g', step: '0.1' },
      { key: 'fat', label: 'Fat', unit: 'g', step: '0.1' },
    ],
  },
  {
    title: 'Fat Breakdown',
    fields: [
      { key: 'saturated_fat', label: 'Saturated Fat', unit: 'g', step: '0.1' },
      {
        key: 'polyunsaturated_fat',
        label: 'Polyunsaturated Fat',
        unit: 'g',
        step: '0.1',
      },
      {
        key: 'monounsaturated_fat',
        label: 'Monounsaturated Fat',
        unit: 'g',
        step: '0.1',
      },
      { key: 'trans_fat', label: 'Trans Fat', unit: 'g', step: '0.1' },
    ],
  },
  {
    title: 'Minerals & Other',
    fields: [
      { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', step: '0.1' },
      { key: 'sodium', label: 'Sodium', unit: 'mg', step: '0.1' },
      { key: 'potassium', label: 'Potassium', unit: 'mg', step: '0.1' },
      { key: 'dietary_fiber', label: 'Dietary Fiber', unit: 'g', step: '0.1' },
    ],
  },
  {
    title: 'Sugars & Vitamins',
    fields: [
      { key: 'sugars', label: 'Sugars', unit: 'g', step: '0.1' },
      { key: 'vitamin_a', label: 'Vitamin A', unit: 'μg', step: '0.1' },
      { key: 'vitamin_c', label: 'Vitamin C', unit: 'mg', step: '0.1' },
      { key: 'calcium', label: 'Calcium', unit: 'mg', step: '0.1' },
      { key: 'iron', label: 'Iron', unit: 'mg', step: '0.1' },
    ],
  },
];

const GLYCEMIC_INDEX_OPTIONS: { value: GlycemicIndex; label: string }[] = [
  { value: 'None', label: 'None' },
  { value: 'Very Low', label: 'Very Low' },
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
  { value: 'Very High', label: 'Very High' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gridId(variantIndex: number, key: string) {
  return `nutrient-${variantIndex}-${key}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export function NutrientGrid({
  variantIndex,
  variant,
  visibleNutrients,
  energyUnit,
  convertEnergy,
  customNutrients,
  onUpdate,
}: NutrientGridProps) {
  const isLocked = variant.is_locked ?? false;
  const visible = new Set(visibleNutrients);

  const update = (field: string) => (val: string) =>
    onUpdate(variantIndex, field, val);

  return (
    <div className="space-y-4">
      {/* Glycemic Index */}
      {visible.has('glycemic_index') && (
        <div>
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
              className="w-45"
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
      )}

      {/* Calories (special-cased for energy unit conversion) */}
      {visible.has('calories') && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <NutrientInput
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
          </div>
        </div>
      )}

      {/* Standard sections */}
      {NUTRIENT_SECTIONS.map((section) => {
        const visibleFields = section.fields.filter((f) => visible.has(f.key));
        if (visibleFields.length === 0) return null;

        return (
          <div key={section.title}>
            <h5 className="text-sm font-medium text-gray-700 mb-3">
              {section.title}
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleFields.map(({ key, label, unit, step }) => (
                <NutrientInput
                  key={key}
                  id={gridId(variantIndex, key)}
                  label={`${label} (${unit})`}
                  value={variant[key] ?? ''}
                  step={step}
                  disabled={isLocked}
                  onChange={update(key)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Custom nutrients */}
      {customNutrients && customNutrients.some((n) => visible.has(n.name)) && (
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-3">
            Custom Nutrients
          </h5>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {customNutrients
              .filter((n) => visible.has(n.name))
              .map((nutrient) => (
                <NutrientInput
                  key={nutrient.id}
                  id={gridId(variantIndex, nutrient.name)}
                  label={`${nutrient.name} (${nutrient.unit})`}
                  value={variant.custom_nutrients?.[nutrient.name] ?? ''}
                  disabled={isLocked}
                  onChange={update(nutrient.name)}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
