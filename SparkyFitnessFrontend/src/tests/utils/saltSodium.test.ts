import { saltGramsToSodiumMg, sodiumMgToSaltGrams } from '@workspace/shared';

describe('saltSodium', () => {
  it('converts label salt (g) to sodium (mg) at 400 mg per gram', () => {
    expect(saltGramsToSodiumMg(0.1)).toBe(40);
    expect(saltGramsToSodiumMg(1)).toBe(400);
    expect(saltGramsToSodiumMg(2.5)).toBe(1000);
    expect(saltGramsToSodiumMg(0)).toBe(0);
  });

  it('rounds sodium to the field precision of 0.1 mg', () => {
    expect(saltGramsToSodiumMg(0.123)).toBe(49.2);
  });

  it('converts sodium (mg) back to salt (g) at the 0.01 g the field shows', () => {
    expect(sodiumMgToSaltGrams(40)).toBe(0.1);
    expect(sodiumMgToSaltGrams(400)).toBe(1);
    expect(sodiumMgToSaltGrams(123)).toBe(0.31);
  });

  it('round-trips a label value', () => {
    expect(sodiumMgToSaltGrams(saltGramsToSodiumMg(0.75))).toBe(0.75);
  });

  it('leaves an empty field empty', () => {
    expect(saltGramsToSodiumMg(undefined)).toBeUndefined();
    expect(sodiumMgToSaltGrams(undefined)).toBeUndefined();
  });
});
