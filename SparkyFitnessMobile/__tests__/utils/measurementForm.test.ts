import {
  EMPTY_FORM,
  buildStandardFormFromMeasurement,
  formatNumberForInput,
  standardFieldMetricValue,
  type FormState,
  type MeasurementUnitModes,
} from '../../src/utils/measurementForm';

const METRIC: MeasurementUnitModes = {
  weightMode: 'kg',
  bodyUnit: 'cm',
  heightMode: 'cm',
};

const IMPERIAL: MeasurementUnitModes = {
  weightMode: 'lbs',
  bodyUnit: 'inches',
  heightMode: 'inches',
};

describe('buildStandardFormFromMeasurement', () => {
  test('converts a stored metric row into display values', () => {
    const { values, prefilled } = buildStandardFormFromMeasurement(
      {
        weight: 80,
        height: 180,
        neck: 40,
        waist: 90,
        hips: 100,
        steps: 5000,
        body_fat_percentage: 18.5,
        muscle_mass_kg: 60,
        bone_mass_kg: 3.2,
        body_water_percentage: 55,
        bmr: 1700,
      },
      METRIC
    );

    expect(values.weight).toBe('80');
    expect(values.height).toBe('180');
    expect(prefilled).toEqual(
      new Set([
        'weight',
        'height',
        'neck',
        'waist',
        'hips',
        'steps',
        'bodyFatPercentage',
        'muscleMassKg',
        'boneMassKg',
        'bodyWaterPercentage',
        'bmr',
      ])
    );
  });

  test('only prefills fields that carry a value', () => {
    const { values, prefilled } = buildStandardFormFromMeasurement(
      { weight: 80 },
      METRIC
    );
    expect(values).toEqual({ weight: '80' });
    expect(prefilled).toEqual(new Set(['weight']));
  });

  test('a missing row prefills nothing', () => {
    const { values, prefilled } = buildStandardFormFromMeasurement(
      null,
      METRIC
    );
    expect(values).toEqual({});
    expect(prefilled.size).toBe(0);
  });

  test('splits weight into stones and lbs', () => {
    const { values } = buildStandardFormFromMeasurement(
      { weight: 80 },
      {
        weightMode: 'st_lbs',
        bodyUnit: 'cm',
        heightMode: 'cm',
      }
    );
    // 80 kg = 12 st 8.3698 lb
    expect(values.weightStones).toBe('12');
    expect(values.weight).toBe('8.4');
  });

  test('splits height into feet and inches', () => {
    const { values } = buildStandardFormFromMeasurement(
      { height: 180 },
      {
        weightMode: 'kg',
        bodyUnit: 'cm',
        heightMode: 'ft_in',
      }
    );
    expect(values.heightFeet).toBe('5');
    expect(values.height).toBe('10.9');
  });

  test('converts lengths to inches for the imperial preference', () => {
    const { values } = buildStandardFormFromMeasurement(
      { waist: 90 },
      IMPERIAL
    );
    expect(values.waist).toBe('35.4');
  });
});

describe('formatNumberForInput', () => {
  test('rounds to one decimal and drops a trailing zero', () => {
    expect(formatNumberForInput(18.54)).toBe('18.5');
    expect(formatNumberForInput(18.5)).toBe('18.5');
    expect(formatNumberForInput(80)).toBe('80');
  });
});

describe('standardFieldMetricValue', () => {
  const form = (overrides: Partial<FormState>): FormState => ({
    ...EMPTY_FORM,
    ...overrides,
  });

  test('returns null for a blank field', () => {
    expect(standardFieldMetricValue('weight', form({}), METRIC)).toBeNull();
    expect(standardFieldMetricValue('waist', form({}), METRIC)).toBeNull();
  });

  test('reads plain metric values unchanged', () => {
    expect(
      standardFieldMetricValue('weight', form({ weight: '80.5' }), METRIC)
    ).toBe(80.5);
    expect(
      standardFieldMetricValue('waist', form({ waist: '90' }), METRIC)
    ).toBe(90);
  });

  test('converts an imperial weight to kg for storage', () => {
    const value = standardFieldMetricValue(
      'weight',
      form({ weight: '176.37' }),
      IMPERIAL
    );
    expect(value).toBeCloseTo(80, 1);
  });

  test('converts stones + lbs to a single kg value', () => {
    const value = standardFieldMetricValue(
      'weight',
      form({ weightStones: '12', weight: '8' }),
      { weightMode: 'st_lbs', bodyUnit: 'cm', heightMode: 'cm' }
    );
    // 12 st 8 lb = 176 lb
    expect(value).toBeCloseTo(79.83, 1);
  });

  test('converts feet + inches to a single cm value', () => {
    const value = standardFieldMetricValue(
      'height',
      form({ heightFeet: '5', height: '11' }),
      { weightMode: 'kg', bodyUnit: 'cm', heightMode: 'ft_in' }
    );
    // 5 ft 11 in = 71 in = 180.34 cm
    expect(value).toBeCloseTo(180.34, 1);
  });

  test('converts concentrated mass fields with the weight preference', () => {
    const value = standardFieldMetricValue(
      'muscleMassKg',
      form({ muscleMassKg: '132.28' }),
      IMPERIAL
    );
    expect(value).toBeCloseTo(60, 1);
  });

  test('returns null for unparseable input instead of a wrong number', () => {
    expect(
      standardFieldMetricValue('waist', form({ waist: 'abc' }), METRIC)
    ).toBeNull();
  });

  test('treats a wholly blank two-input field as omitted', () => {
    // Both halves blank is "no value", which the save path omits.
    expect(
      standardFieldMetricValue(
        'weight',
        form({ weightStones: '', weight: '' }),
        { weightMode: 'st_lbs', bodyUnit: 'cm', heightMode: 'cm' }
      )
    ).toBeNull();
  });

  test('treats a blank half of a two-input field as zero, like the save path', () => {
    // Stones filled, pounds blank: `handleSave` parses a blank subfield as 0,
    // so the calculator has to read the same value rather than inventing null.
    expect(
      standardFieldMetricValue(
        'weight',
        form({ weightStones: '12', weight: '' }),
        { weightMode: 'st_lbs', bodyUnit: 'cm', heightMode: 'cm' }
      )
    ).toBeCloseTo(76.2, 1);
  });

  test('reads a feet + inches height with a blank inches half as zero inches', () => {
    expect(
      standardFieldMetricValue(
        'height',
        form({ heightFeet: '6', height: '' }),
        { weightMode: 'kg', bodyUnit: 'cm', heightMode: 'ft_in' }
      )
    ).toBeCloseTo(182.88, 1);
  });
});
