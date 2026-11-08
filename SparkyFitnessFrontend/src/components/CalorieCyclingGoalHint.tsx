import { useTranslation } from 'react-i18next';
import { cycleDayTarget } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useCalorieCyclingActive } from '@/hooks/Goals/useCalorieCyclingActive';

/** 0 = Sunday, for a 'YYYY-MM-DD' calendar day. */
function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).getDay();
}

/**
 * Under a goal form's calorie field: the typed calories are the base target,
 * and what calorie cycling makes of them on `day`. Renders nothing when
 * cycling is off. The safety floor is left out, so the number is "about".
 */
export const CalorieCyclingGoalHint = ({
  calories,
  day,
}: {
  calories: number;
  day: string;
}) => {
  const { t } = useTranslation();
  const {
    calorieCyclingOffsets,
    convertEnergy,
    energyUnit,
    getEnergyUnitString,
  } = usePreferences();
  const active = useCalorieCyclingActive();
  if (!active || !(calories > 0)) return null;

  const cycled = cycleDayTarget({
    baseTarget: calories,
    offsets: calorieCyclingOffsets,
    weekday: weekdayOf(day),
    floor: null,
  });
  const amount = Math.round(convertEnergy(cycled.target, 'kcal', energyUnit));
  const unit = getEnergyUnitString(energyUnit);

  return (
    <p
      className="text-xs text-muted-foreground"
      data-testid="calorie-cycling-goal-hint"
    >
      {cycled.delta > 0
        ? t(
            'goals.calorieCycling.hintHigh',
            'Calorie cycling is on, so this is your base target. This day becomes about {{amount}} {{unit}} (high day).',
            { amount, unit }
          )
        : cycled.delta < 0
          ? t(
              'goals.calorieCycling.hintLow',
              'Calorie cycling is on, so this is your base target. This day becomes about {{amount}} {{unit}} (low day).',
              { amount, unit }
            )
          : t(
              'goals.calorieCycling.hintEven',
              'Calorie cycling is on, so this is your base target. This day stays the same.'
            )}
    </p>
  );
};
