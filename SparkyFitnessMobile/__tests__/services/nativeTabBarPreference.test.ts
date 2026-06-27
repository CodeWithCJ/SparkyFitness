import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook } from '@testing-library/react-native';
import { useNativeIOSTabsActive } from '../../src/services/nativeTabBarPreference';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { shouldUseNativeIOSTabs } from '../../src/utils/nativeTabs';

jest.mock('../../src/utils/nativeTabs', () => ({
  shouldUseNativeIOSTabs: jest.fn(),
}));

const mockShouldUseNativeIOSTabs = shouldUseNativeIOSTabs as jest.MockedFunction<
  typeof shouldUseNativeIOSTabs
>;

describe('useNativeIOSTabsActive', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetAppPreferencesStoreForTests();
    mockShouldUseNativeIOSTabs.mockReset();
  });

  it('is false when the device does not support native iOS tabs, even if enabled', () => {
    mockShouldUseNativeIOSTabs.mockReturnValue(false);
    useAppPreferencesStore.getState().setLiquidGlassTabBarEnabled(true);

    const { result } = renderHook(() => useNativeIOSTabsActive());

    expect(result.current).toBe(false);
  });

  it('is false when supported but the toggle is disabled', () => {
    mockShouldUseNativeIOSTabs.mockReturnValue(true);

    const { result } = renderHook(() => useNativeIOSTabsActive());

    expect(result.current).toBe(false);
  });

  it('is true only when supported and the toggle is enabled', () => {
    mockShouldUseNativeIOSTabs.mockReturnValue(true);
    useAppPreferencesStore.getState().setLiquidGlassTabBarEnabled(true);

    const { result } = renderHook(() => useNativeIOSTabsActive());

    expect(result.current).toBe(true);
  });
});
