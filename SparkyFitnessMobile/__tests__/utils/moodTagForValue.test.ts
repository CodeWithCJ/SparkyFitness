import { moodTagForValue } from '@workspace/shared';

describe('moodTagForValue', () => {
  it('is null for an absent value and the banded tag otherwise', () => {
    expect(moodTagForValue(null)).toBeNull();
    expect(moodTagForValue(undefined)).toBeNull();
    expect(moodTagForValue(70)).toBe('confident');
    expect(moodTagForValue(0)).toBe('sad');
  });
});
