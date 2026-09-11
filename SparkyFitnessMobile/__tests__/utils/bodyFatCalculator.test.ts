import {
  BodyFatAlgorithm,
  calculateBodyFatBmi,
  calculateBodyFatNavy,
  type BodyFatGender,
} from '@workspace/shared';
import {
  calculateBodyFatPercentage,
  resolveBodyFatInputs,
  type BodyFatMeasurementInputs,
} from '../../src/utils/bodyFatCalculator';

const emptyInputs: BodyFatMeasurementInputs = {
  weightKg: null,
  heightCm: null,
  waistCm: null,
  neckCm: null,
  hipsCm: null,
};

describe('calculateBodyFatPercentage — web parity', () => {
  // The web check-in calls these exact shared functions and compares the result
  // to two decimals. Asserting the raw number keeps the mobile result provably
  // identical to the web one for every representative case.
  const maleCases: { heightCm: number; waistCm: number; neckCm: number }[] = [
    { heightCm: 180, waistCm: 90, neckCm: 40 },
    { heightCm: 175, waistCm: 85, neckCm: 38 },
    { heightCm: 190, waistCm: 100, neckCm: 42 },
  ];

  const femaleCases: {
    heightCm: number;
    waistCm: number;
    neckCm: number;
    hipsCm: number;
  }[] = [
    { heightCm: 170, waistCm: 75, neckCm: 35, hipsCm: 100 },
    { heightCm: 160, waistCm: 70, neckCm: 32, hipsCm: 95 },
    { heightCm: 165, waistCm: 80, neckCm: 34, hipsCm: 105 },
  ];

  it.each(maleCases)(
    'matches the shared U.S. Navy result for a male ($heightCm/$waistCm/$neckCm)',
    ({ heightCm, waistCm, neckCm }) => {
      const result = calculateBodyFatPercentage({
        algorithm: BodyFatAlgorithm.US_NAVY,
        gender: 'male',
        age: 30,
        inputs: { ...emptyInputs, heightCm, waistCm, neckCm },
      });

      expect(result).toEqual({
        ok: true,
        percentage: calculateBodyFatNavy('male', heightCm, waistCm, neckCm),
      });
    }
  );

  it.each(femaleCases)(
    'matches the shared U.S. Navy result for a female ($heightCm/$waistCm/$neckCm/$hipsCm)',
    ({ heightCm, waistCm, neckCm, hipsCm }) => {
      const result = calculateBodyFatPercentage({
        algorithm: BodyFatAlgorithm.US_NAVY,
        gender: 'female',
        age: 30,
        inputs: { ...emptyInputs, heightCm, waistCm, neckCm, hipsCm },
      });

      expect(result).toEqual({
        ok: true,
        percentage: calculateBodyFatNavy(
          'female',
          heightCm,
          waistCm,
          neckCm,
          hipsCm
        ),
      });
    }
  );

  it.each([
    { gender: 'male' as BodyFatGender, weightKg: 80, heightCm: 180, age: 30 },
    { gender: 'male' as BodyFatGender, weightKg: 95, heightCm: 175, age: 45 },
    { gender: 'female' as BodyFatGender, weightKg: 60, heightCm: 165, age: 28 },
    { gender: 'female' as BodyFatGender, weightKg: 72, heightCm: 170, age: 52 },
  ])(
    'matches the shared BMI Method result for $gender/$weightKg/$heightCm/$age',
    ({ gender, weightKg, heightCm, age }) => {
      const result = calculateBodyFatPercentage({
        algorithm: BodyFatAlgorithm.BMI,
        gender,
        age,
        inputs: { ...emptyInputs, weightKg, heightCm },
      });

      expect(result).toEqual({
        ok: true,
        percentage: calculateBodyFatBmi(weightKg, heightCm, age, gender),
      });
    }
  );

  it('defaults to the U.S. Navy method for an unset algorithm', () => {
    const inputs = { ...emptyInputs, heightCm: 180, waistCm: 90, neckCm: 40 };
    const unset = calculateBodyFatPercentage({
      algorithm: undefined,
      gender: 'male',
      age: 30,
      inputs,
    });
    const navy = calculateBodyFatPercentage({
      algorithm: BodyFatAlgorithm.US_NAVY,
      gender: 'male',
      age: 30,
      inputs,
    });
    expect(unset).toEqual(navy);
  });
});

describe('calculateBodyFatPercentage — validation', () => {
  it('requires a gender for either method', () => {
    for (const algorithm of [BodyFatAlgorithm.US_NAVY, BodyFatAlgorithm.BMI]) {
      expect(
        calculateBodyFatPercentage({
          algorithm,
          gender: null,
          age: 30,
          inputs: { ...emptyInputs, weightKg: 80, heightCm: 180 },
        })
      ).toEqual({ ok: false, reason: 'profile-required' });
    }
  });

  it('rejects an unrecognised gender instead of letting the formula throw', () => {
    expect(
      calculateBodyFatPercentage({
        algorithm: BodyFatAlgorithm.US_NAVY,
        gender: 'other',
        age: 30,
        inputs: { ...emptyInputs, heightCm: 180, waistCm: 90, neckCm: 40 },
      })
    ).toEqual({ ok: false, reason: 'profile-required' });
  });

  it('requires weight, height, age and gender for the BMI method', () => {
    const base = {
      algorithm: BodyFatAlgorithm.BMI,
      gender: 'male',
      age: 30,
      inputs: { ...emptyInputs, weightKg: 80, heightCm: 180 },
    };

    expect(
      calculateBodyFatPercentage({
        ...base,
        inputs: { ...base.inputs, weightKg: null },
      })
    ).toEqual({ ok: false, reason: 'bmi-required-fields' });
    expect(
      calculateBodyFatPercentage({
        ...base,
        inputs: { ...base.inputs, heightCm: null },
      })
    ).toEqual({ ok: false, reason: 'bmi-required-fields' });
    expect(calculateBodyFatPercentage({ ...base, age: 0 })).toEqual({
      ok: false,
      reason: 'bmi-required-fields',
    });
  });

  it('requires height, waist and neck for the U.S. Navy method', () => {
    const base = {
      algorithm: BodyFatAlgorithm.US_NAVY,
      gender: 'male',
      age: 30,
      inputs: { ...emptyInputs, heightCm: 180, waistCm: 90, neckCm: 40 },
    };

    expect(
      calculateBodyFatPercentage({
        ...base,
        inputs: { ...base.inputs, heightCm: null },
      })
    ).toEqual({ ok: false, reason: 'navy-required-fields' });
    expect(
      calculateBodyFatPercentage({
        ...base,
        inputs: { ...base.inputs, waistCm: null },
      })
    ).toEqual({ ok: false, reason: 'navy-required-fields' });
    expect(
      calculateBodyFatPercentage({
        ...base,
        inputs: { ...base.inputs, neckCm: null },
      })
    ).toEqual({ ok: false, reason: 'navy-required-fields' });
  });

  it('requires hips for a female but ignores them for a male', () => {
    const inputs = { ...emptyInputs, heightCm: 170, waistCm: 75, neckCm: 35 };

    expect(
      calculateBodyFatPercentage({
        algorithm: BodyFatAlgorithm.US_NAVY,
        gender: 'female',
        age: 30,
        inputs,
      })
    ).toEqual({ ok: false, reason: 'navy-required-fields' });

    // A male with no hips is a normal, computable case.
    const male = calculateBodyFatPercentage({
      algorithm: BodyFatAlgorithm.US_NAVY,
      gender: 'male',
      age: 30,
      inputs: { ...emptyInputs, heightCm: 180, waistCm: 90, neckCm: 40 },
    });
    expect(male.ok).toBe(true);
  });

  it('reports zero or negative measurements as validation failures', () => {
    const inputs = {
      ...emptyInputs,
      heightCm: 180,
      waistCm: 90,
      neckCm: 40,
    };

    expect(
      calculateBodyFatPercentage({
        algorithm: BodyFatAlgorithm.US_NAVY,
        gender: 'male',
        age: 30,
        inputs: { ...inputs, waistCm: 0 },
      })
    ).toEqual({ ok: false, reason: 'navy-required-fields' });
    expect(
      calculateBodyFatPercentage({
        algorithm: BodyFatAlgorithm.BMI,
        gender: 'male',
        age: 30,
        inputs: { ...emptyInputs, weightKg: 0, heightCm: 180 },
      })
    ).toEqual({ ok: false, reason: 'bmi-required-fields' });
  });

  it('reports a domain error as uncomputable rather than writing a zero', () => {
    // Web passes this through: the formula returns 0 and the field would be
    // filled with 0.00, which is not a body fat percentage.
    const sharedResult = calculateBodyFatNavy('male', 180, 40, 40);
    expect(sharedResult).toBe(0);

    expect(
      calculateBodyFatPercentage({
        algorithm: BodyFatAlgorithm.US_NAVY,
        gender: 'male',
        age: 30,
        inputs: { ...emptyInputs, heightCm: 180, waistCm: 40, neckCm: 40 },
      })
    ).toEqual({ ok: false, reason: 'uncomputable' });
  });

  it('reports a result the save path would reject as uncomputable', () => {
    // The field rejects >100 on save, so surfacing 114 here would hand the user
    // a value they cannot keep.
    const inputs = {
      ...emptyInputs,
      heightCm: 150,
      waistCm: 250,
      neckCm: 20,
      hipsCm: 200,
    };
    const sharedResult = calculateBodyFatNavy(
      'female',
      inputs.heightCm,
      inputs.waistCm,
      inputs.neckCm,
      inputs.hipsCm
    );
    expect(sharedResult).toBeGreaterThan(100);

    expect(
      calculateBodyFatPercentage({
        algorithm: BodyFatAlgorithm.US_NAVY,
        gender: 'female',
        age: 30,
        inputs,
      })
    ).toEqual({ ok: false, reason: 'uncomputable' });
  });
});

describe('resolveBodyFatInputs', () => {
  const formValues: BodyFatMeasurementInputs = {
    weightKg: 80,
    heightCm: 180,
    waistCm: 90,
    neckCm: 40,
    hipsCm: 100,
  };

  it('uses only the form values when Use Recent is off', () => {
    expect(
      resolveBodyFatInputs({
        useRecent: false,
        formValues,
        recentValues: {
          weightKg: 70,
          heightCm: 170,
          waistCm: 80,
          neckCm: 35,
          hipsCm: 95,
        },
      })
    ).toEqual(formValues);
  });

  it('prefers each recent value, like the web toggle', () => {
    expect(
      resolveBodyFatInputs({
        useRecent: true,
        formValues,
        recentValues: {
          weightKg: 70,
          heightCm: 170,
          waistCm: 80,
          neckCm: 35,
          hipsCm: 95,
        },
      })
    ).toEqual({
      weightKg: 70,
      heightCm: 170,
      waistCm: 80,
      neckCm: 35,
      hipsCm: 95,
    });
  });

  it('falls back per field when a recent value is missing', () => {
    expect(
      resolveBodyFatInputs({
        useRecent: true,
        formValues,
        recentValues: { weightKg: 70, hipsCm: null },
      })
    ).toEqual({
      weightKg: 70,
      // Nothing recorded for these, so the form's own value is used.
      heightCm: 180,
      waistCm: 90,
      neckCm: 40,
      hipsCm: 100,
    });
  });

  it('treats absent recent keys as no recent value', () => {
    expect(
      resolveBodyFatInputs({
        useRecent: true,
        formValues,
        recentValues: {},
      })
    ).toEqual(formValues);
  });
});
