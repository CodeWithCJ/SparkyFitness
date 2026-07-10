import { buildSaudiDefaultPreferences } from '@/utils/defaultPreferences';

describe('buildSaudiDefaultPreferences', () => {
  it('builds Saudi-first defaults for a new user without overriding device timezone', () => {
    const defaults = buildSaudiDefaultPreferences('user-1', 'Asia/Dubai');

    expect(defaults).toEqual(
      expect.objectContaining({
        user_id: 'user-1',
        language: 'ar',
        date_format: 'dd/MM/yyyy',
        default_weight_unit: 'kg',
        default_measurement_unit: 'cm',
        default_distance_unit: 'km',
        water_display_unit: 'ml',
        energy_unit: 'kcal',
        first_day_of_week: 0,
        timezone: 'Asia/Dubai',
      })
    );
  });

  it('uses Riyadh only when the device cannot provide a timezone', () => {
    expect(buildSaudiDefaultPreferences('user-1', '').timezone).toBe(
      'Asia/Riyadh'
    );
    expect(buildSaudiDefaultPreferences('user-1', null).timezone).toBe(
      'Asia/Riyadh'
    );
  });
});
