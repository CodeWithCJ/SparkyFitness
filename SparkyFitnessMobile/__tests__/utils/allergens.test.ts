import { matchAllergens } from '../../src/utils/allergens';

describe('matchAllergens', () => {
  it('returns nothing when the user tracks no allergens', () => {
    expect(matchAllergens([], ['milk'], ['soy'])).toEqual({
      allergens: [],
      traces: [],
    });
    expect(matchAllergens(undefined, ['milk'])).toEqual({
      allergens: [],
      traces: [],
    });
  });

  it('matches case-insensitively and separates traces', () => {
    expect(
      matchAllergens(['Milk', 'soy'], ['MILK', 'eggs'], ['Soy', 'fish'])
    ).toEqual({ allergens: ['MILK'], traces: ['Soy'] });
  });

  it('tolerates null lists', () => {
    expect(matchAllergens(['milk'], null, null)).toEqual({
      allergens: [],
      traces: [],
    });
  });
});
