import { describe, expect, it } from 'vitest';
import {
  convertWeight,
  convertMeasurement,
  convertEnergy,
  LBS_TO_KG,
  KG_TO_LBS,
  INCH_TO_CM,
  CM_TO_INCH,
  FT_TO_CM,
  G_PER_KG,
  KCAL_TO_KJ,
  KJ_TO_KCAL,
} from '../ai/tools/unitConversion.js';

describe('convertWeight', () => {
  it('converts lbs to kg', () => {
    expect(convertWeight(10, 'lbs', 'kg')).toBe(10 * LBS_TO_KG);
  });

  it('converts kg to lbs', () => {
    expect(convertWeight(10, 'kg', 'lbs')).toBe(10 * KG_TO_LBS);
  });

  it("treats the 'lb' alias as lbs", () => {
    expect(convertWeight(10, 'lb', 'kg')).toBe(10 * 0.45359237);
  });

  it('converts g to kg', () => {
    expect(convertWeight(500, 'g', 'kg')).toBe(500 / G_PER_KG);
  });

  it('returns the value unchanged when units match', () => {
    expect(convertWeight(70, 'kg', 'kg')).toBe(70);
    expect(convertWeight(150, 'lb', 'lbs')).toBe(150);
  });

  it('passes unknown units through unchanged', () => {
    expect(convertWeight(12, 'stone', 'kg')).toBe(12);
  });

  it('is case-insensitive at the converter level', () => {
    expect(convertWeight(10, 'LB', 'KG')).toBe(10 * LBS_TO_KG);
  });
});

describe('convertMeasurement', () => {
  it('converts in to cm', () => {
    expect(convertMeasurement(10, 'in', 'cm')).toBe(10 * INCH_TO_CM);
  });

  it('converts cm to in', () => {
    expect(convertMeasurement(10, 'cm', 'in')).toBe(10 * CM_TO_INCH);
  });

  it("treats the 'inch' alias as in", () => {
    expect(convertMeasurement(10, 'inch', 'cm')).toBe(10 * 2.54);
  });

  it('converts ft to cm', () => {
    expect(convertMeasurement(6, 'ft', 'cm')).toBe(6 * FT_TO_CM);
  });

  it('returns the value unchanged when units match', () => {
    expect(convertMeasurement(90, 'cm', 'cm')).toBe(90);
    expect(convertMeasurement(36, 'inch', 'in')).toBe(36);
  });

  it('passes unknown units through unchanged', () => {
    expect(convertMeasurement(2, 'm', 'cm')).toBe(2);
  });

  it('is case-insensitive at the converter level', () => {
    expect(convertMeasurement(10, 'INCH', 'CM')).toBe(10 * INCH_TO_CM);
  });
});

describe('convertEnergy', () => {
  it('converts kcal to kJ', () => {
    expect(convertEnergy(100, 'kcal', 'kj')).toBe(100 * KCAL_TO_KJ);
  });

  it('converts kJ to kcal', () => {
    expect(convertEnergy(100, 'kj', 'kcal')).toBe(100 * KJ_TO_KCAL);
  });

  it("treats 'calories' as kcal", () => {
    expect(convertEnergy(100, 'calories', 'kj')).toBe(100 * KCAL_TO_KJ);
  });

  it('passes unknown units through unchanged', () => {
    expect(convertEnergy(100, 'cal', 'kj')).toBe(100);
  });
});
