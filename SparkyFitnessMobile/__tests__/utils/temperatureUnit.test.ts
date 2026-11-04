import { temperatureUnitFor } from '../../src/utils/temperatureUnit';

describe('temperatureUnitFor', () => {
  test('uses the account temperature setting', () => {
    expect(
      temperatureUnitFor({
        default_temperature_unit: 'celsius',
        default_distance_unit: 'miles',
      })
    ).toBe('celsius');
    expect(
      temperatureUnitFor({
        default_temperature_unit: 'fahrenheit',
        default_distance_unit: 'km',
      })
    ).toBe('fahrenheit');
  });

  test('follows the distance setting on a server without the setting', () => {
    expect(temperatureUnitFor({ default_distance_unit: 'miles' })).toBe(
      'fahrenheit'
    );
    expect(temperatureUnitFor({ default_distance_unit: 'km' })).toBe('celsius');
    expect(temperatureUnitFor(undefined)).toBe('celsius');
  });
});
