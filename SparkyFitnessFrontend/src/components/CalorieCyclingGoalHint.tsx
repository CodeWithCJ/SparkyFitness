import { useTranslation } from 'react-i18next';
import { cycleDayTarget } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { CalorieCyclingForDay } from '@/hooks/Goals/useCalorieCyclingActive';

/** 0 = Sunday, for a 'YYYY-MM-DD' calendar day. */
function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).getDay();
}

/**
 * Under a goal form's calorie field: the typed calories are the base target,
 * and what calorie cycling makes of them on `day` (respecting that day's
 * safety floor). Warns instead when saving the edit would pause cycling.
 */
export const CalorieCyclingGoalHint = ({
  calories,
  day,
  cycling,
}: {
  calories: number;
  day: string;
  cycling: CalorieCyclingForDay;
}) => {
  const { t } = useTranslation();
  const { convertEnergy, energyUnit, getEnergyUnitString } = usePreferences();

  if (cycling.pausedBySave) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="calorie-cycling-goal-hint"
      >
        {t(
          'goals.calorieCycling.hintPausedBySave',
          'Saving this calorie goal switches to a manual goal, which adds exercise calories back and pauses calorie cycling.'
        )}
      </p>
    );
  }
  if (!cycling.active) return null;
  const unit = getEnergyUnitString(energyUnit);

  // With an adaptive target the typed calories are not the base, so show the
  // day as the server cycled it instead of cycling the typed number.
  if (!cycling.typedIsBase) {
    const server = cycling.serverTarget;
    if (!server || server.delta === 0) return null;
    const amount = Math.round(convertEnergy(server.target, 'kcal', energyUnit));
    return (
      <p
        className="text-xs text-muted-foreground"
        data-testid="calorie-cycling-goal-hint"
      >
        {server.delta > 0
          ? t(
              'goals.calorieCycling.hintAdaptiveHigh',
              'Calorie cycling is on. With your adaptive target this day is about {{amount}} {{unit}} (high day).',
              { amount, unit }
            )
          : t(
              'goals.calorieCycling.hintAdaptiveLow',
              'Calorie cycling is on. With your adaptive target this day is about {{amount}} {{unit}} (low day).',
              { amount, unit }
            )}
      </p>
    );
  }
  if (!(calories > 0)) return null;

  const cycled = cycleDayTarget({
    baseTarget: calories,
    offsets: cycling.offsets,
    weekday: weekdayOf(day),
    floor: cycling.floor,
  });
  const amount = Math.round(convertEnergy(cycled.target, 'kcal', energyUnit));

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
