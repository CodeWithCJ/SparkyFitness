import { describe, expect, it } from 'vitest';
import garminMeasurementMapping from '../integrations/garminconnect/garminMeasurementMapping.js';

describe('Garmin daily calorie measurement mapping', () => {
  it('routes active calories through the deduplicated Active Calories path', () => {
    expect(garminMeasurementMapping.active_calories).toEqual({
      targetType: 'custom',
      name: 'Active Calories',
      dataType: 'numeric',
      measurementType: 'kcal',
      frequency: 'Daily',
    });
  });

  it('stores Garmin resting calories as the external BMR category', () => {
    expect(garminMeasurementMapping.bmr_calories).toEqual({
      targetType: 'custom',
      name: 'basal_metabolic_rate',
      dataType: 'numeric',
      measurementType: 'kcal',
      frequency: 'Daily',
    });
  });

  it('stores Garmin total calories as a reportable daily measurement', () => {
    expect(garminMeasurementMapping.total_calories).toEqual({
      targetType: 'custom',
      name: 'total_calories',
      dataType: 'numeric',
      measurementType: 'kcal',
      frequency: 'Daily',
    });
  });
});
