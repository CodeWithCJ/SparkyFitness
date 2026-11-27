import { describe, expect, it } from 'vitest';
import {
  formatServing,
  roundEnergy,
  roundNutrient,
} from '../ai/tools/formatting.js';

describe('roundNutrient', () => {
  it.each([
    [44.500000000000014, 1, 44.5],
    ['2.25', 1, 2.3],
    [0.04, 1, 0],
    [0.04, 2, 0.04],
    [-0.04, 1, 0],
    [1948.0945945945946, 0, 1948],
  ])('rounds %s to %s decimals', (value, digits, expected) => {
    expect(roundNutrient(value, digits)).toBe(expected);
  });

  it.each([
    [812.3456, 812.3],
    [0.0444, 0.04],
    [-0.0444, -0.04],
    [1, 1],
  ])('defaults %s to one decimal, two below 1', (value, expected) => {
    expect(roundNutrient(value)).toBe(expected);
  });

  it.each([null, undefined, '', 'abc', Number.NaN])(
    'returns %s unchanged',
    (value) => {
      expect(roundNutrient(value)).toBe(value);
    }
  );

  it('rounds decimal midpoints up', () => {
    expect(roundNutrient(0.145)).toBe(0.15);
    expect(roundNutrient(1.05)).toBe(1.1);
    expect(roundNutrient(1.005, 2)).toBe(1.01);
    expect(roundNutrient(1e-7)).toBe(0);
    expect(roundNutrient(-0.145)).toBe(-0.15);
    expect(roundNutrient('0.145')).toBe(0.15);
    expect(roundEnergy(2.5)).toBe(3);
    expect(roundNutrient(-1e-7)).toBe(0);
    expect(roundNutrient(1e21, 1)).toBe(1e21);
    expect(roundNutrient(1234.5, -1)).toBe(1235);
    expect(roundNutrient(-1.5e-7, 7)).toBe(-2e-7);
  });

  it('rounds energy to a whole number', () => {
    expect(roundEnergy(405.00000000000006)).toBe(405);
    expect(roundEnergy('263.25')).toBe(263);
  });
});

describe('formatServing', () => {
  it.each([
    [100, 'g', '100 g'],
    ['100.00', 'g', '100 g'],
    [0.125, 'cup', '0.125 cup'],
    [4, ' pieces ', '4 pieces'],
    [1, null, '1'],
    [null, 'g', '? g'],
    ['', 'g', '? g'],
    ['abc', 'g', '? g'],
    [Number.NaN, 'g', '? g'],
    [undefined, undefined, '?'],
  ])('formats %s %s as %s', (size, unit, expected) => {
    expect(formatServing(size, unit)).toBe(expected);
  });
});
