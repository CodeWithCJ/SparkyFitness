import { describe, expect, it } from 'vitest';
import { nutritionLabelScanResultSchema } from '@workspace/shared';

describe('nutritionLabelScanResultSchema', () => {
  it('keeps a well-formed reading as it is', () => {
    const reading = nutritionLabelScanResultSchema.parse({
      name: 'Oat Bar',
      brand: 'Acme',
      serving_size: 40,
      serving_unit: 'g',
      calories: 180,
      protein: 4,
      carbs: 27,
      fat: 6,
      fiber: 3,
      sodium: 95,
    });

    expect(reading).toMatchObject({
      name: 'Oat Bar',
      brand: 'Acme',
      serving_size: 40,
      serving_unit: 'g',
      calories: 180,
      fiber: 3,
      sodium: 95,
    });
  });

  it('turns missing fields into null', () => {
    const reading = nutritionLabelScanResultSchema.parse({ calories: 120 });

    expect(reading.calories).toBe(120);
    expect(reading.name).toBeNull();
    expect(reading.serving_size).toBeNull();
    expect(reading.vitamin_c).toBeNull();
  });

  it('reads amounts a model wrote as strings', () => {
    const reading = nutritionLabelScanResultSchema.parse({
      calories: '250',
      protein: ' 12.5 ',
    });

    expect(reading.calories).toBe(250);
    expect(reading.protein).toBe(12.5);
  });

  it('drops amounts that are not usable numbers', () => {
    const reading = nutritionLabelScanResultSchema.parse({
      calories: '12g',
      protein: -3,
      carbs: '',
      fat: Number.NaN,
      fiber: true,
    });

    expect(reading.calories).toBeNull();
    expect(reading.protein).toBeNull();
    expect(reading.carbs).toBeNull();
    expect(reading.fat).toBeNull();
    expect(reading.fiber).toBeNull();
  });

  it('trims text and treats blank text as missing', () => {
    const reading = nutritionLabelScanResultSchema.parse({
      name: '  Granola  ',
      brand: '   ',
      serving_unit: 42,
    });

    expect(reading.name).toBe('Granola');
    expect(reading.brand).toBeNull();
    expect(reading.serving_unit).toBeNull();
  });

  it('rejects a response that is not an object', () => {
    expect(() => nutritionLabelScanResultSchema.parse('no label')).toThrow();
  });
});
