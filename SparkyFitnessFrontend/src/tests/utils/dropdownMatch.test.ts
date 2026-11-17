import { matchDropdownValue } from '@/utils/dropdownMatch';

describe('matchDropdownValue', () => {
  it('matches case-insensitively and returns the canonical option', () => {
    const options = ['breakfast', 'lunch', 'dinner', 'snacks'];
    expect(matchDropdownValue('Lunch', options)).toBe('lunch');
    expect(matchDropdownValue('DINNER', options)).toBe('dinner');
    expect(matchDropdownValue('Snacks', options)).toBe('snacks');
  });

  it('returns "" when nothing matches (no silent fallback)', () => {
    expect(matchDropdownValue('brunch', ['breakfast', 'lunch'])).toBe('');
    expect(matchDropdownValue('', ['breakfast', 'lunch'])).toBe('');
    expect(matchDropdownValue(undefined, ['breakfast', 'lunch'])).toBe('');
  });

  it('trims whitespace before comparing', () => {
    expect(matchDropdownValue('  Lunch  ', ['breakfast', 'lunch'])).toBe(
      'lunch'
    );
    expect(matchDropdownValue('lunch', [' Lunch '])).toBe(' Lunch ');
  });

  it('works with capitalized stored meal-type options (the MFP direction)', () => {
    const options = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
    expect(matchDropdownValue('lunch', options)).toBe('Lunch');
    expect(matchDropdownValue('BREAKFAST', options)).toBe('Breakfast');
  });
});
