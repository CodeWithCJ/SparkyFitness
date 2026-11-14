import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHALLENGE_GOAL_TYPES,
  type ChallengeGoalType,
} from '@workspace/shared';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { goalTypeLabel } from './challengeCopy';

/** The member's own weekly goal, which the self-adjusting goal bonus measures. */
const GoalTypeSelect = ({
  value,
  onChange,
}: {
  value: ChallengeGoalType;
  onChange: (goal: ChallengeGoalType) => void;
}) => {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {t('challenges.join.goalType', 'Your weekly goal')}
      </Label>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as ChallengeGoalType)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CHALLENGE_GOAL_TYPES.map((goal) => (
            <SelectItem key={goal} value={goal}>
              {goalTypeLabel(t, goal)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default GoalTypeSelect;
