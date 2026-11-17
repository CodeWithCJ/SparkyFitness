import { BmrAlgorithm, calculateBmr } from '@/services/bmrService';

describe('calculateBmr with Oxford', () => {
  it.each([
    ['female', 60, 25, 1340],
    ['female', 60, 45, 1277],
    ['female', 60, 65, 1177],
    ['male', 70, 25, 1664],
    ['male', 70, 45, 1583],
    ['male', 70, 65, 1456],
  ] as const)('%s, %i kg, age %i', (gender, weight, age, expected) => {
    expect(
      Math.round(calculateBmr(BmrAlgorithm.OXFORD, weight, 170, age, gender))
    ).toBe(expected);
  });
});
