import {
  NATIVE_IOS_TABS_MIN_VERSION,
  supportsNativeIOSTabs,
} from '../../src/utils/nativeTabs';

describe('supportsNativeIOSTabs', () => {
  it.each([
    ['android', 26, false],
    ['ios', 18, false],
    ['ios', 25.9, false],
    ['ios', 26, true],
    ['ios', '26.1', true],
    ['ios', 'not-a-version', false],
  ])('returns %s/%s support as %s', (os, version, expected) => {
    expect(supportsNativeIOSTabs(os, version)).toBe(expected);
  });

  it('keeps the native tab threshold explicit', () => {
    expect(NATIVE_IOS_TABS_MIN_VERSION).toBe(26);
  });
});
