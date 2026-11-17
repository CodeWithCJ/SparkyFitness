import { kcalFromEnergyInput, shownEnergyInput } from '@/utils/energyInput';

describe('energy input helpers', () => {
  it('shows kcal exactly and kJ as a whole number', () => {
    expect(shownEnergyInput(312.4, 'kcal')).toBe(312.4);
    expect(shownEnergyInput(100, 'kJ')).toBe(418);
    expect(shownEnergyInput('', 'kJ')).toBe('');
    expect(shownEnergyInput(null, 'kJ')).toBe('');
  });

  it('turns a typed kJ value into kcal without rounding', () => {
    expect(kcalFromEnergyInput(418.4, 'kJ')).toBeCloseTo(100);
    expect(kcalFromEnergyInput(250, 'kcal')).toBe(250);
    expect(kcalFromEnergyInput('', 'kJ')).toBe('');
  });

  it('keeps what was typed through the round trip', () => {
    // 41 kJ is 9.8 kcal; rounding that would show 42 kJ while typing.
    for (const typed of [4, 41, 418, 2092]) {
      const kcal = kcalFromEnergyInput(typed, 'kJ') as number;
      expect(shownEnergyInput(kcal, 'kJ')).toBe(typed);
    }
  });
});
