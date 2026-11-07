import {
  energyFromKcal,
  energyToKcal,
  normalizeEnergyUnit,
} from '@workspace/shared';
import i18n from '../../src/localization/i18n';
import {
  displayTextToKcalText,
  energyUnitLabel,
  formatEnergyNumber,
  kcalTextToDisplayText,
  roundedEnergy,
} from '../../src/utils/energyUnit';

const t = i18n.t.bind(i18n);

describe('normalizeEnergyUnit', () => {
  test('keeps the two known units', () => {
    expect(normalizeEnergyUnit('kcal')).toBe('kcal');
    expect(normalizeEnergyUnit('kJ')).toBe('kJ');
  });

  test('reads anything else as kcal', () => {
    // The preference column is free text, and an older server may send none.
    expect(normalizeEnergyUnit(undefined)).toBe('kcal');
    expect(normalizeEnergyUnit(null)).toBe('kcal');
    expect(normalizeEnergyUnit('kj')).toBe('kcal');
    expect(normalizeEnergyUnit('')).toBe('kcal');
  });
});

describe('energy conversion', () => {
  test('converts kcal to kJ and back', () => {
    expect(energyFromKcal(100, 'kJ')).toBeCloseTo(418.4);
    expect(energyToKcal(418.4, 'kJ')).toBeCloseTo(100);
  });

  test('leaves kcal untouched', () => {
    expect(energyFromKcal(123.45, 'kcal')).toBe(123.45);
    expect(energyToKcal(123.45, 'kcal')).toBe(123.45);
  });

  test('rounds for display in the chosen unit', () => {
    expect(roundedEnergy(100, 'kJ')).toBe(418);
    expect(roundedEnergy(100.6, 'kcal')).toBe(101);
    expect(formatEnergyNumber(500, 'kJ')).toBe('2,092');
  });

  test('labels each unit', () => {
    expect(energyUnitLabel('kcal', t)).toBe('kcal');
    expect(energyUnitLabel('kJ', t)).toBe('kJ');
  });
});

describe('energy input text', () => {
  test('passes kcal text through unchanged', () => {
    expect(kcalTextToDisplayText('99.5', 'kcal')).toBe('99.5');
    expect(displayTextToKcalText('12.', 'kcal')).toBe('12.');
  });

  test('shows stored kcal as whole kJ', () => {
    expect(kcalTextToDisplayText('100', 'kJ')).toBe('418');
    expect(kcalTextToDisplayText('', 'kJ')).toBe('');
  });

  test('turns typed kJ into kcal for the server', () => {
    expect(displayTextToKcalText('418.4', 'kJ')).toBe('100');
    expect(displayTextToKcalText('418', 'kJ')).toBe('99.9044');
  });

  test('leaves text that is not a number alone', () => {
    expect(displayTextToKcalText('', 'kJ')).toBe('');
    expect(kcalTextToDisplayText('abc', 'kJ')).toBe('abc');
  });
});
