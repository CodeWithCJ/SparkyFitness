import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { type GoalPreset } from '@/api/Goals/goals';
import type { ExpandedGoals } from '@/types/goals';
import { NUTRIENT_CONFIG } from '@/constants/goals';

export const NutrientInput = <T extends ExpandedGoals | GoalPreset>({
  field,
  state,
  setState,
  visibleNutrients,
}: {
  field: (typeof NUTRIENT_CONFIG)[number];
  state: T;
  setState: (newState: T) => void;
  visibleNutrients: string[];
}) => {
  const { t } = useTranslation();
  if (!visibleNutrients.includes(field.id)) return null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.id} className="text-xs">
        {t(field.label, field.default)}
      </Label>
      <Input
        id={field.id}
        min={0}
        type="number"
        value={(state[field.id as keyof T] as number) ?? ''}
        onChange={(e) => {
          const val = e.target.value === '' ? 0 : Number(e.target.value);
          setState({ ...state, [field.id]: val });
        }}
      />
    </div>
  );
};
