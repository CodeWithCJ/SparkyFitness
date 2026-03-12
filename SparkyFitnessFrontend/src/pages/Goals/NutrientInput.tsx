import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/NumericInput';
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

  return (
    <div className="space-y-1.5">
      <Label htmlFor={nutrientId} className="text-xs">
        {t(metadata.label, metadata.defaultLabel)}
        {metadata.unit ? ` (${metadata.unit})` : ''}
      </Label>
      <NumericInput
        id={nutrientId}
        min={0}
        step={decimals === 0 ? 1 : Math.pow(0.1, decimals)}
        decimals={decimals}
        value={value}
        onValueChange={(val) => setState({ ...state, [nutrientId]: val })}
      />
    </div>
  );
};
