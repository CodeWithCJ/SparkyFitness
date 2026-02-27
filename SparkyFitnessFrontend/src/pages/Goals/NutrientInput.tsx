import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import type { ExpandedGoals, GoalPreset } from '@/types/goals';
import { getNutrientMetadata } from '@/utils/nutrientUtils';
import { UserCustomNutrient } from '@/types/customNutrient';

export const NutrientInput = <T extends ExpandedGoals | GoalPreset>({
  nutrientId,
  state,
  setState,
  visibleNutrients,
  customNutrients = [],
}: {
  nutrientId: string;
  state: T;
  setState: (newState: T) => void;
  visibleNutrients: string[];
  customNutrients?: UserCustomNutrient[];
}) => {
  const { t } = useTranslation();
  if (!visibleNutrients.includes(nutrientId)) return null;

  const metadata = getNutrientMetadata(nutrientId, customNutrients);
  const decimals = metadata.decimals;

  const value = state[nutrientId as keyof T] as number;
  // If value is undefined/null, show empty string.
  // If it's a number, format it, but preserve user input experience?
  // Actually standard input behavior is fine with number.
  // We use string for display to allow formatting (though toFixed returns string).
  // But value prop on Input type="number" can be number or string.

  // To avoid cursor jumping issues with formatting on every render during change,
  // we usually might want to keep local state, but here we are controlled by parent.
  // We'll trust the parent state is updated.
  // However, input type="number" step={0.1} usually works fine with number values.

  // The original code used toFixed for value, which converts to string.
  // Let's stick to that pattern but use metadata.decimals.
  const displayValue =
    value !== undefined && value !== null ? value.toFixed(decimals) : '';

  return (
    <div className="space-y-1.5">
      <Label htmlFor={nutrientId} className="text-xs">
        {t(metadata.label, metadata.defaultLabel)}
        {metadata.unit ? ` (${metadata.unit})` : ''}
      </Label>
      <Input
        id={nutrientId}
        min={0}
        step={decimals === 0 ? 1 : Math.pow(0.1, decimals)} // e.g. 0.1 or 0.01
        type="number"
        value={displayValue}
        onChange={(e) => {
          const val = e.target.value === '' ? 0 : Number(e.target.value);
          setState({ ...state, [nutrientId]: val });
        }}
        onBlur={(e) => {
          // Ensure rounding on blur if needed
          const val = Number(e.target.value);
          const rounded = Number(val.toFixed(decimals));
          if (val !== rounded) {
            setState({ ...state, [nutrientId]: rounded });
          }
        }}
      />
    </div>
  );
};
