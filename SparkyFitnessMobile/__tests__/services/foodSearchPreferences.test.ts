import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  searchSourcesPopover,
  providerSelectorPopover,
  FOOD_SEARCH_POPOVERS,
} from '../../src/services/foodSearchPreferences';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('foodSearchPreferences — coaching popover flags', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('registry lists every popover with a stable id and reset label', () => {
    expect(FOOD_SEARCH_POPOVERS).toEqual([
      searchSourcesPopover,
      providerSelectorPopover,
    ]);
    for (const popover of FOOD_SEARCH_POPOVERS) {
      expect(popover.id).toBeTruthy();
      expect(popover.resetLabel).toBeTruthy();
    }
  });

  describe.each([
    ['sources', searchSourcesPopover, '@FoodSearch:seenSourcesPopover'],
    ['provider', providerSelectorPopover, '@FoodSearch:seenProviderPopover'],
  ])('%s popover', (_name, popover, storageKey) => {
    test('returns false before the popover has been seen', async () => {
      await expect(popover.hasSeen()).resolves.toBe(false);
    });

    test('markSeen persists and hasSeen returns true', async () => {
      await popover.markSeen();
      await expect(popover.hasSeen()).resolves.toBe(true);
    });

    test('uses the namespaced storage key', async () => {
      await popover.markSeen();
      await expect(AsyncStorage.getItem(storageKey)).resolves.toBe('true');
    });

    test('reset clears the flag so the popover shows again', async () => {
      await popover.markSeen();
      await expect(popover.hasSeen()).resolves.toBe(true);
      await popover.reset();
      await expect(popover.hasSeen()).resolves.toBe(false);
    });

    test('treats a read failure as seen so it never spams the popover', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('disk error'));
      await expect(popover.hasSeen()).resolves.toBe(true);
    });
  });

  test('each popover flag is independent', async () => {
    await searchSourcesPopover.markSeen();
    await expect(searchSourcesPopover.hasSeen()).resolves.toBe(true);
    await expect(providerSelectorPopover.hasSeen()).resolves.toBe(false);

    await providerSelectorPopover.markSeen();
    await searchSourcesPopover.reset();
    await expect(searchSourcesPopover.hasSeen()).resolves.toBe(false);
    await expect(providerSelectorPopover.hasSeen()).resolves.toBe(true);
  });
});
