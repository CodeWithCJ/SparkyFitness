import {
  formatDose,
  formatStrengthPerUnit,
  formatTimeOfDay,
  formatWithMeal,
  describeSchedule,
  describeSchedules,
} from '@workspace/shared';

describe('formatDose', () => {
  it('prefers the schedule dose override, in the medication dose_unit', () => {
    const med = {
      dose_amount: 1,
      dose_unit: 'tablet',
      strength_value: 500,
      strength_unit: 'mg',
    };
    expect(formatDose(med, { dose_amount: 2 })).toBe('2 tablet');
  });

  it('falls back to the medication default dose', () => {
    const med = {
      dose_amount: 1,
      dose_unit: 'tablet',
      strength_value: 500,
      strength_unit: 'mg',
    };
    expect(formatDose(med)).toBe('1 tablet');
    expect(formatDose(med, { dose_amount: null })).toBe('1 tablet');
  });

  it('falls back to strength when no dose is set', () => {
    expect(formatDose({ strength_value: 10, strength_unit: 'mg' })).toBe(
      '10 mg',
    );
  });

  it('returns null when nothing is set', () => {
    expect(formatDose({})).toBeNull();
  });

  it('omits a missing unit without trailing whitespace', () => {
    expect(formatDose({ dose_amount: 2, dose_unit: null })).toBe('2');
    expect(formatDose({ dose_amount: 2, dose_unit: '' })).toBe('2');
  });
});

describe('formatStrengthPerUnit', () => {
  it('formats strength per dose unit', () => {
    const med = {
      dose_amount: 2,
      dose_unit: 'tablet',
      strength_value: 500,
      strength_unit: 'mg',
    };
    expect(formatStrengthPerUnit(med)).toBe('500 mg per tablet');
  });

  it('suppresses the line when the dose mirrors the strength (web-created rows)', () => {
    const med = {
      dose_amount: 10,
      dose_unit: 'mg',
      strength_value: 10,
      strength_unit: 'mg',
    };
    expect(formatStrengthPerUnit(med)).toBeNull();
  });

  it('shows the line when value matches but the unit differs', () => {
    const med = {
      dose_amount: 10,
      dose_unit: 'ml',
      strength_value: 10,
      strength_unit: 'mg',
    };
    expect(formatStrengthPerUnit(med)).toBe('10 mg per ml');
  });

  it('returns null when there is no strength', () => {
    expect(
      formatStrengthPerUnit({ dose_amount: 1, dose_unit: 'tablet' }),
    ).toBeNull();
  });

  it('returns null when strength is already the primary dose display', () => {
    expect(
      formatStrengthPerUnit({ strength_value: 10, strength_unit: 'mg' }),
    ).toBeNull();
  });

  it('drops the "per" clause when the dose has no unit', () => {
    const med = {
      dose_amount: 2,
      dose_unit: null,
      strength_value: 500,
      strength_unit: 'mg',
    };
    expect(formatStrengthPerUnit(med)).toBe('500 mg');
  });
});

describe('formatTimeOfDay', () => {
  it('formats an HH:MM string in a readable form', () => {
    expect(formatTimeOfDay('08:00')).toBe('8:00 AM');
    expect(formatTimeOfDay('21:30')).toBe('9:30 PM');
  });

  it('tolerates seconds', () => {
    expect(formatTimeOfDay('08:00:00')).toBe('8:00 AM');
  });

  it('returns malformed input unchanged', () => {
    expect(formatTimeOfDay('noon')).toBe('noon');
  });
});

describe('formatWithMeal', () => {
  it.each([
    ['before', 'Before meal'],
    ['with', 'With meal'],
    ['after', 'After meal'],
    ['away_from_meals', 'Away from meals'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatWithMeal(value)).toBe(expected);
  });

  it('passes unknown values through', () => {
    expect(formatWithMeal('bedtime')).toBe('bedtime');
  });
});

describe('describeSchedule', () => {
  it('describes a daily schedule with its time', () => {
    expect(
      describeSchedule({ schedule_type_id: 'daily', time_of_day: '08:00' }),
    ).toBe('Daily at 8:00 AM');
  });

  it('describes a daily schedule without a time', () => {
    expect(describeSchedule({ schedule_type_id: 'daily' })).toBe('Daily');
  });

  it('lists specific days sorted Sunday-first', () => {
    expect(
      describeSchedule({
        schedule_type_id: 'specific_days',
        days_of_week: [5, 1, 3],
        time_of_day: '21:00',
      }),
    ).toBe('Mon, Wed, Fri at 9:00 PM');
  });

  it('falls back to Weekly when day data is missing', () => {
    expect(
      describeSchedule({ schedule_type_id: 'weekly', days_of_week: [] }),
    ).toBe('Weekly');
  });

  it('describes every-n-days intervals', () => {
    expect(
      describeSchedule({ schedule_type_id: 'every_n_days', interval_days: 3 }),
    ).toBe('Every 3 days');
    expect(
      describeSchedule({ schedule_type_id: 'every_n_days', interval_days: 1 }),
    ).toBe('Daily');
  });

  it('describes monthly schedules', () => {
    expect(
      describeSchedule({ schedule_type_id: 'monthly', day_of_month: 15 }),
    ).toBe('Monthly on day 15');
    expect(describeSchedule({ schedule_type_id: 'monthly' })).toBe('Monthly');
  });

  it('describes cyclic schedules', () => {
    expect(
      describeSchedule({
        schedule_type_id: 'cyclic',
        cycle_on_days: 21,
        cycle_off_days: 7,
      }),
    ).toBe('21 days on, 7 days off');
  });

  it('labels PRN as-needed and ignores any time', () => {
    expect(
      describeSchedule({ schedule_type_id: 'prn', time_of_day: '08:00' }),
    ).toBe('As needed');
  });

  it('title-cases unknown schedule types', () => {
    expect(describeSchedule({ schedule_type_id: 'twice_daily' })).toBe(
      'Twice daily',
    );
  });
});

describe('describeSchedules', () => {
  it('treats no schedules as as-needed', () => {
    expect(describeSchedules([])).toBe('As needed');
  });

  it('summarizes a single schedule', () => {
    expect(
      describeSchedules([{ schedule_type_id: 'daily', time_of_day: '08:00' }]),
    ).toBe('Daily at 8:00 AM');
  });

  it('merges same-frequency schedules with times sorted chronologically', () => {
    expect(
      describeSchedules([
        { schedule_type_id: 'daily', time_of_day: '20:00' },
        { schedule_type_id: 'daily', time_of_day: '08:00' },
      ]),
    ).toBe('Daily at 8:00 AM & 8:00 PM');
  });

  it('separates distinct frequencies', () => {
    expect(
      describeSchedules([
        { schedule_type_id: 'daily', time_of_day: '08:00' },
        {
          schedule_type_id: 'specific_days',
          days_of_week: [1, 3],
          time_of_day: '21:00',
        },
      ]),
    ).toBe('Daily at 8:00 AM; Mon, Wed at 9:00 PM');
  });

  it('lists PRN alongside scheduled frequencies', () => {
    expect(
      describeSchedules([
        { schedule_type_id: 'daily', time_of_day: '08:00' },
        { schedule_type_id: 'prn' },
      ]),
    ).toBe('Daily at 8:00 AM; As needed');
  });

  it('ignores inactive schedules', () => {
    expect(
      describeSchedules([
        { schedule_type_id: 'daily', time_of_day: '08:00' },
        { schedule_type_id: 'daily', time_of_day: '20:00', active: false },
      ]),
    ).toBe('Daily at 8:00 AM');
  });

  it('returns an empty summary when every schedule is inactive', () => {
    expect(
      describeSchedules([{ schedule_type_id: 'daily', active: false }]),
    ).toBe('');
  });
});

// A cabinet stocked across the rename holds both sentinels: supplements created under
// phase one carry 'dose', ones created since carry 'serving'. Reading "1 dose" beside
// "1 serving" for two supplements is the bug this normalises away.
describe('formatDose for supplements', () => {
  const supplement = (over: Record<string, unknown> = {}) => ({
    dose_amount: 1,
    dose_unit: 'serving',
    is_supplement: true,
    ...over,
  });

  it('renders the legacy dose sentinel as a serving', () => {
    expect(formatDose(supplement({ dose_unit: 'dose' }))).toBe('1 serving');
  });

  it('renders the current sentinel unchanged', () => {
    expect(formatDose(supplement())).toBe('1 serving');
  });

  it('pluralises', () => {
    expect(formatDose(supplement({ dose_amount: 2, dose_unit: 'dose' }))).toBe(
      '2 servings',
    );
    expect(formatDose(supplement({ dose_amount: 2 }))).toBe('2 servings');
  });

  it('pluralises a schedule override too', () => {
    expect(formatDose(supplement(), { dose_amount: 3 })).toBe('3 servings');
  });

  it('keeps a real unit set through the API', () => {
    // Only the placeholders get rewritten; "5 ml" is information, not a sentinel.
    expect(formatDose(supplement({ dose_amount: 5, dose_unit: 'ml' }))).toBe(
      '5 ml',
    );
  });

  it('leaves plain medications alone', () => {
    expect(
      formatDose({
        dose_amount: 2,
        dose_unit: 'tablet',
        is_supplement: false,
      }),
    ).toBe('2 tablet');
  });
});
