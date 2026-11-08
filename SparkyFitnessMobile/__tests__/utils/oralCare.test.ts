import type { TFunction } from 'i18next';
import { brushingQuadrant } from '@workspace/shared';
import {
  formatOralCareClock,
  oralCareSessionLabel,
} from '../../src/utils/oralCare';
import { normalizeOralCareReminderTimes } from '../../src/utils/checkinReminderTimes';

const t = ((_key: string, options: { defaultValue: string }) =>
  options.defaultValue) as unknown as TFunction;

describe('oral care helpers', () => {
  it('formats a duration as m:ss', () => {
    expect(formatOralCareClock(0)).toBe('0:00');
    expect(formatOralCareClock(125)).toBe('2:05');
  });

  it('moves through the four quarters and past the target', () => {
    expect(brushingQuadrant(0, 120)).toBe(0);
    expect(brushingQuadrant(29, 120)).toBe(0);
    expect(brushingQuadrant(30, 120)).toBe(1);
    expect(brushingQuadrant(119, 120)).toBe(3);
    expect(brushingQuadrant(120, 120)).toBe(4);
  });

  it('names an "other" session by its own name', () => {
    expect(
      oralCareSessionLabel(
        { care_type: 'other', custom_label: 'Water flosser' },
        t
      )
    ).toBe('Water flosser');
    expect(
      oralCareSessionLabel({ care_type: 'flossing', custom_label: null }, t)
    ).toBe('Flossing');
  });

  it('keeps up to three brushing reminder times, defaulting to morning and evening', () => {
    expect(normalizeOralCareReminderTimes([])).toEqual(['08:00', '21:00']);
    expect(
      normalizeOralCareReminderTimes(['22:00', '07:00', '12:00', '13:00'])
    ).toEqual(['07:00', '12:00', '13:00']);
  });
});
