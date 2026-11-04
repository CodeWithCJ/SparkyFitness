import {
  convertTemperature,
  convertTemperatureDelta,
  temperatureUnitFor,
} from '../../src/utils/temperatureUnit';

describe('temperatureUnit', () => {
  test('follows the distance setting', () => {
    expect(temperatureUnitFor('miles')).toBe('fahrenheit');
    expect(temperatureUnitFor('km')).toBe('celsius');
    expect(temperatureUnitFor(undefined)).toBe('celsius');
  });

  test('converts a temperature with the 32° offset', () => {
    expect(convertTemperature(0, 'fahrenheit')).toBe(32);
    expect(convertTemperature(37, 'fahrenheit')).toBeCloseTo(98.6);
    expect(convertTemperature(37, 'celsius')).toBe(37);
  });

  test('converts a difference without the offset', () => {
    expect(convertTemperatureDelta(-0.5, 'fahrenheit')).toBeCloseTo(-0.9);
    expect(convertTemperatureDelta(-0.5, 'celsius')).toBe(-0.5);
  });
});
