import { filterByOwnership } from '../../src/utils/shareStatus';

const CURRENT_USER = 'user-1';

describe('filterByOwnership', () => {
  const mine = { id: 'mine', user_id: CURRENT_USER };
  const mineCamel = { id: 'mine-camel', userId: CURRENT_USER };
  const family = { id: 'family', user_id: 'user-2' };
  const familyCamel = { id: 'family-camel', userId: 'user-2' };
  const publicSnake = { id: 'public-snake', user_id: 'user-2', is_public: true };
  const publicShared = { id: 'public-shared', user_id: 'user-2', shared_with_public: true };
  const publicCamel = { id: 'public-camel', userId: 'user-2', sharedWithPublic: true };
  const ownPublic = { id: 'own-public', user_id: CURRENT_USER, is_public: true };
  const noOwner = { id: 'no-owner' };
  const items = [mine, mineCamel, family, familyCamel, publicSnake, publicShared, publicCamel, ownPublic, noOwner];

  it('returns the input unchanged for the all filter', () => {
    expect(filterByOwnership(items, 'all', CURRENT_USER)).toBe(items);
  });

  it('keeps only items owned by the current user for mine, in either casing', () => {
    const result = filterByOwnership(items, 'mine', CURRENT_USER);
    expect(result.map((item) => item.id)).toEqual(['mine', 'mine-camel', 'own-public']);
  });

  it('keeps only other users\' non-public items with an owner for family', () => {
    const result = filterByOwnership(items, 'family', CURRENT_USER);
    expect(result.map((item) => item.id)).toEqual(['family', 'family-camel']);
  });

  it('keeps publicly shared items for public, across all three flag shapes', () => {
    const result = filterByOwnership(items, 'public', CURRENT_USER);
    expect(result.map((item) => item.id)).toEqual([
      'public-snake',
      'public-shared',
      'public-camel',
      'own-public',
    ]);
  });

  it('matches nothing for mine and family when no current user id is given', () => {
    expect(filterByOwnership(items, 'mine', undefined)).toEqual([]);
    expect(filterByOwnership(items, 'family', undefined)).toEqual([]);
  });
});
