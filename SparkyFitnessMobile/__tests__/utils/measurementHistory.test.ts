import {
  deriveCustomFieldHints,
  deriveStandardFieldHints,
  hasSelectedDayValue,
  reduceLatestManualEntries,
  selectedDayCustomValues,
  selectedDayDisplayValues,
  shouldOfferCustomHint,
  shouldOfferStandardHint,
} from '../../src/utils/measurementHistory';
import { isManualSource } from '../../src/utils/customMeasurementsForm';
import type { MeasurementUnitModes } from '../../src/utils/measurementForm';

const METRIC: MeasurementUnitModes = {
  weightMode: 'kg',
  bodyUnit: 'cm',
  heightMode: 'cm',
};

describe('deriveStandardFieldHints', () => {
  it('produces a suggestion per carried-forward field', () => {
    const hints = deriveStandardFieldHints(
      {
        weight: 80,
        height: 180,
        neck: 40,
        waist: 90,
        hips: 100,
        body_fat_percentage: 18.5,
        muscle_mass_kg: 60,
        bone_mass_kg: 3.2,
        body_water_percentage: 55,
      },
      METRIC
    );

    expect(hints.weight?.display).toBe('80');
    expect(hints.height?.display).toBe('180');
    expect(hints.neck?.display).toBe('40');
    expect(hints.waist?.display).toBe('90');
    expect(hints.hips?.display).toBe('100');
    expect(hints.bodyFatPercentage?.display).toBe('18.5');
    expect(hints.muscleMassKg?.display).toBe('60');
    expect(hints.boneMassKg?.display).toBe('3.2');
    expect(hints.bodyWaterPercentage?.display).toBe('55');
  });

  it('produces no suggestion for fields with no history', () => {
    const hints = deriveStandardFieldHints({ weight: 80 }, METRIC);
    expect(hints.weight).toBeDefined();
    expect(hints.waist).toBeUndefined();
    expect(hints.hips).toBeUndefined();
    expect(hints.steps).toBeUndefined();
    expect(hints.bmr).toBeUndefined();
  });

  it('produces no suggestions at all without history', () => {
    expect(deriveStandardFieldHints(null, METRIC)).toEqual({});
    expect(deriveStandardFieldHints(undefined, METRIC)).toEqual({});
  });

  it('converts stored kilograms to the user display unit', () => {
    const hints = deriveStandardFieldHints(
      { weight: 80 },
      {
        weightMode: 'lbs',
        bodyUnit: 'cm',
        heightMode: 'cm',
      }
    );
    // 80 kg = 176.3698... lbs -> one decimal.
    expect(hints.weight?.display).toBe('176.4');
  });

  it('converts stored centimetres to inches for body measurements', () => {
    const hints = deriveStandardFieldHints(
      { waist: 90 },
      {
        weightMode: 'kg',
        bodyUnit: 'inches',
        heightMode: 'cm',
      }
    );
    // 90 cm = 35.4330... in -> one decimal.
    expect(hints.waist?.display).toBe('35.4');
  });

  it('exposes both inputs of a stones + lbs weight', () => {
    const hints = deriveStandardFieldHints(
      { weight: 80 },
      {
        weightMode: 'st_lbs',
        bodyUnit: 'cm',
        heightMode: 'cm',
      }
    );
    // 80 kg = 176.3698 lb = 12 st 8.3698 lb.
    expect(hints.weight?.companionDisplay).toBe('12');
    expect(hints.weight?.display).toBe('8.4');
    expect(hints.weight?.adopt).toEqual({ weight: '8.4', weightStones: '12' });
  });

  it('exposes both inputs of a feet + inches height', () => {
    const hints = deriveStandardFieldHints(
      { height: 180 },
      {
        weightMode: 'kg',
        bodyUnit: 'cm',
        heightMode: 'ft_in',
      }
    );
    // 180 cm = 70.866 in = 5 ft 10.866 in.
    expect(hints.height?.companionDisplay).toBe('5');
    expect(hints.height?.display).toBe('10.9');
    expect(hints.height?.adopt).toEqual({ height: '10.9', heightFeet: '5' });
  });

  it('adopting a single-input field writes exactly that one key', () => {
    const hints = deriveStandardFieldHints({ waist: 90 }, METRIC);
    expect(hints.waist?.adopt).toEqual({ waist: '90' });
    expect(hints.waist?.companionDisplay).toBeNull();
  });
});

describe('selectedDayDisplayValues / hasSelectedDayValue', () => {
  it('reports which fields the selected day actually recorded', () => {
    const values = selectedDayDisplayValues({ weight: 80 }, METRIC);
    expect(hasSelectedDayValue('weight', values)).toBe(true);
    expect(hasSelectedDayValue('waist', values)).toBe(false);
  });

  it('treats an absent day as having no values', () => {
    const values = selectedDayDisplayValues(null, METRIC);
    expect(hasSelectedDayValue('weight', values)).toBe(false);
  });

  it('does not treat a recorded zero weight as absent', () => {
    // 0 is a real stored number; the form shows '0', not ''.
    const values = selectedDayDisplayValues({ weight: 0 }, METRIC);
    expect(hasSelectedDayValue('weight', values)).toBe(true);
  });
});

describe('shouldOfferStandardHint', () => {
  const hint = {
    display: '80',
    companionDisplay: null,
    adopt: { weight: '80' },
  };

  it('offers a suggestion while the input is empty and the day has no value', () => {
    expect(
      shouldOfferStandardHint({
        currentRaw: '',
        selectedDayValues: {},
        field: 'weight',
        hint,
      })
    ).toBe(true);
  });

  it('never offers a suggestion when the selected day already has a value', () => {
    // The actual measurement is the editable value; history must not compete
    // with it even after the user clears the input.
    expect(
      shouldOfferStandardHint({
        currentRaw: '',
        selectedDayValues: selectedDayDisplayValues({ weight: 80 }, METRIC),
        field: 'weight',
        hint,
      })
    ).toBe(false);
  });

  it('does not offer a suggestion while the input holds anything', () => {
    expect(
      shouldOfferStandardHint({
        currentRaw: '81',
        selectedDayValues: {},
        field: 'weight',
        hint,
      })
    ).toBe(false);
  });

  it('treats a whitespace-only input as empty, matching the save path', () => {
    // `evaluateField` trims before deciding a field is blank, so '  ' is empty
    // there too — the hint must agree or the two would disagree on screen.
    expect(
      shouldOfferStandardHint({
        currentRaw: '  ',
        selectedDayValues: {},
        field: 'weight',
        hint,
      })
    ).toBe(true);
  });

  it('offers nothing when there is no suggestion', () => {
    expect(
      shouldOfferStandardHint({
        currentRaw: '',
        selectedDayValues: {},
        field: 'weight',
        hint: undefined,
      })
    ).toBe(false);
  });
});

describe('deriveCustomFieldHints', () => {
  const categories = [{ id: 'cat-1' }, { id: 'cat-2' }];

  it('keys suggestions by the category they belong to', () => {
    const hints = deriveCustomFieldHints(categories, [
      {
        id: 'e1',
        category_id: 'cat-1',
        value: '5',
        entry_date: '2024-06-01',
        source: 'manual',
      },
      {
        id: 'e2',
        category_id: 'cat-2',
        value: '9',
        entry_date: '2024-06-02',
        source: 'manual',
      },
    ]);
    expect(hints).toEqual({ 'cat-1': '5', 'cat-2': '9' });
  });

  it('never lets one category inherit another category value', () => {
    const hints = deriveCustomFieldHints(
      [{ id: 'cat-2' }],
      [
        {
          id: 'e1',
          category_id: 'cat-1',
          value: '5',
          entry_date: '2024-06-01',
          source: 'manual',
        },
      ]
    );
    expect(hints['cat-2']).toBeUndefined();
    expect(hints['cat-1']).toBeUndefined();
  });

  it('ignores categories that are not eligible for the editor', () => {
    const hints = deriveCustomFieldHints(
      [],
      [
        {
          id: 'e1',
          category_id: 'cat-1',
          value: '5',
          entry_date: '2024-06-01',
          source: 'manual',
        },
      ]
    );
    expect(hints).toEqual({});
  });

  it('skips blank values', () => {
    const hints = deriveCustomFieldHints(categories, [
      {
        id: 'e1',
        category_id: 'cat-1',
        value: '',
        entry_date: '2024-06-01',
        source: 'manual',
      },
    ]);
    expect(hints).toEqual({});
  });

  it('returns nothing without a lookup result', () => {
    expect(deriveCustomFieldHints(categories, null)).toEqual({});
    expect(deriveCustomFieldHints(categories, undefined)).toEqual({});
    expect(deriveCustomFieldHints(categories, [])).toEqual({});
  });
});

describe('selectedDayCustomValues', () => {
  it('keeps only manual entries for the selected day', () => {
    const values = selectedDayCustomValues(
      [
        { category_id: 'cat-1', value: '5', source: 'manual' },
        { category_id: 'cat-2', value: '9', source: 'HealthConnect' },
        { category_id: 'cat-3', value: '7', source: null },
      ],
      isManualSource
    );
    expect(values).toEqual({ 'cat-1': '5' });
  });

  it('handles a missing entry list', () => {
    expect(selectedDayCustomValues(null, isManualSource)).toEqual({});
  });
});

describe('shouldOfferCustomHint', () => {
  const hints = { 'cat-1': '5' };

  it('offers the suggestion while the field is empty and the day has no manual value', () => {
    expect(
      shouldOfferCustomHint({
        categoryId: 'cat-1',
        currentValue: '',
        selectedDayValues: {},
        hints,
      })
    ).toBe(true);
  });

  it('offers nothing when the day already has a manual value for the category', () => {
    expect(
      shouldOfferCustomHint({
        categoryId: 'cat-1',
        currentValue: '',
        selectedDayValues: { 'cat-1': '5' },
        hints,
      })
    ).toBe(false);
  });

  it('offers nothing when the input already holds a value', () => {
    expect(
      shouldOfferCustomHint({
        categoryId: 'cat-1',
        currentValue: '6',
        selectedDayValues: {},
        hints,
      })
    ).toBe(false);
  });

  it('offers nothing for a category without a suggestion', () => {
    expect(
      shouldOfferCustomHint({
        categoryId: 'cat-2',
        currentValue: '',
        selectedDayValues: {},
        hints,
      })
    ).toBe(false);
  });
});

describe('reduceLatestManualEntries', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({
    id: 'e1',
    category_id: 'cat-1',
    value: '5',
    entry_date: '2024-06-01',
    entry_hour: null,
    entry_timestamp: '2024-06-01T00:00:00.000Z',
    source: 'manual',
    ...overrides,
  });

  it('keeps the newest value per category on or before the day', () => {
    const result = reduceLatestManualEntries(
      [
        entry({
          id: 'a',
          category_id: 'cat-1',
          value: '5',
          entry_date: '2024-06-01',
        }),
        entry({
          id: 'b',
          category_id: 'cat-1',
          value: '9',
          entry_date: '2024-06-10',
        }),
        entry({
          id: 'c',
          category_id: 'cat-2',
          value: '3',
          entry_date: '2024-06-02',
        }),
      ],
      '2024-06-15',
      isManualSource
    );

    expect(result).toEqual([
      {
        id: 'b',
        category_id: 'cat-1',
        value: '9',
        entry_date: '2024-06-10',
        source: 'manual',
      },
      {
        id: 'c',
        category_id: 'cat-2',
        value: '3',
        entry_date: '2024-06-02',
        source: 'manual',
      },
    ]);
  });

  it('never suggests a value recorded after the selected day', () => {
    const result = reduceLatestManualEntries(
      [
        entry({ id: 'past', value: '5', entry_date: '2024-06-01' }),
        entry({ id: 'future', value: '99', entry_date: '2024-07-01' }),
      ],
      '2024-06-15',
      isManualSource
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('5');
  });

  it('keeps a value recorded on the selected day itself', () => {
    // "on or before" is the contract; the day itself must not be excluded.
    const result = reduceLatestManualEntries(
      [entry({ id: 'same-day', value: '42', entry_date: '2024-06-15' })],
      '2024-06-15',
      isManualSource
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('42');
  });

  it('ignores synced entries so a health sample is never a suggestion', () => {
    const result = reduceLatestManualEntries(
      [
        entry({ id: 'sync', value: '12000', source: 'HealthConnect' }),
        entry({ id: 'null', value: '7', source: null }),
        entry({ id: 'manual', value: '5', source: 'manual' }),
      ],
      '2024-06-15',
      isManualSource
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('5');
  });

  it('breaks a same-day tie on the newest timestamp', () => {
    const result = reduceLatestManualEntries(
      [
        entry({
          id: 'old',
          value: 'OLD',
          entry_date: '2024-06-10',
          entry_timestamp: '2024-06-10T08:00:00.000Z',
        }),
        entry({
          id: 'new',
          value: 'NEW',
          entry_date: '2024-06-10',
          entry_timestamp: '2024-06-10T20:00:00.000Z',
        }),
      ],
      '2024-06-15',
      isManualSource
    );

    expect(result).toHaveLength(1);
    expect(result[0].value).toBe('NEW');
  });

  it('skips entries with no usable value', () => {
    const result = reduceLatestManualEntries(
      [
        entry({ id: 'blank', value: '' }),
        entry({ id: 'null', value: null as unknown as string }),
      ],
      '2024-06-15',
      isManualSource
    );

    expect(result).toEqual([]);
  });

  it('returns one row per category and never merges two', () => {
    const result = reduceLatestManualEntries(
      [
        entry({ id: 'a', category_id: 'cat-1', value: '1' }),
        entry({ id: 'b', category_id: 'cat-2', value: '2' }),
        entry({ id: 'c', category_id: 'cat-3', value: '3' }),
      ],
      '2024-06-15',
      isManualSource
    );

    expect(result.map((r) => r.category_id).sort()).toEqual([
      'cat-1',
      'cat-2',
      'cat-3',
    ]);
  });

  it('always labels the result manual, so the shape matches the bulk endpoint', () => {
    const result = reduceLatestManualEntries(
      [entry({ source: 'Manual' })],
      '2024-06-15',
      // A permissive predicate to prove the label is not copied from the source.
      () => true
    );

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('manual');
  });

  it('handles an empty list', () => {
    expect(reduceLatestManualEntries([], '2024-06-15', isManualSource)).toEqual(
      []
    );
  });
});
