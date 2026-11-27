import type { TFunction } from 'i18next';
import { becauseText, coachName } from '@/utils/coachLabels';

// Returns the default value, so the test reads the English wording.
const t = ((key: string, defaultValue?: string) =>
  key === 'coaches.units.percent'
    ? '%'
    : key === 'coaches.units.hours'
      ? 'h'
      : (defaultValue ?? key)) as unknown as TFunction;

describe('coachLabels', () => {
  it('shows the numbers behind a message with their units', () => {
    expect(
      becauseText(t, [
        { signal: 'protein_pct_of_goal', value: 61, op: 'lt', threshold: 70 },
        { signal: 'hours_since_strength', value: 20, op: 'lte', threshold: 48 },
      ])
    ).toBe('protein_pct_of_goal: 61% · hours_since_strength: 20h');
  });

  it('names a custom coach by its own name and a built-in by its key', () => {
    expect(coachName(t, null, 'Race prep')).toBe('Race prep');
    expect(coachName(t, 'recovery', null)).toBe('recovery');
  });
});
