import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook } from '@testing-library/react-native';
import {
  useNativeIOSTabsActive,
  useNativeIOSHeadersActive,
} from '../../src/services/nativeTabBarPreference';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { canUseLiquidGlass } from '../../src/utils/liquidGlass';

jest.mock('../../src/utils/liquidGlass', () => ({
  canUseLiquidGlass: jest.fn(),
}));

const mockCanUseLiquidGlass = canUseLiquidGlass as jest.MockedFunction<
  typeof canUseLiquidGlass
>;

describe('useNativeIOSTabsActive', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetAppPreferencesStoreForTests();
    mockCanUseLiquidGlass.mockReset();
  });

  it('is false when liquid glass is unavailable, even if enabled', () => {
    mockCanUseLiquidGlass.mockReturnValue(false);
    useAppPreferencesStore.getState().setLiquidGlassTabBarEnabled(true);

    const { result } = renderHook(() => useNativeIOSTabsActive());

    expect(result.current).toBe(false);
  });

  it('is false when liquid glass is available but the toggle is disabled', () => {
    mockCanUseLiquidGlass.mockReturnValue(true);

    const { result } = renderHook(() => useNativeIOSTabsActive());

    expect(result.current).toBe(false);
  });

  it('is true only when liquid glass is available and the toggle is enabled', () => {
    mockCanUseLiquidGlass.mockReturnValue(true);
    useAppPreferencesStore.getState().setLiquidGlassTabBarEnabled(true);

    const { result } = renderHook(() => useNativeIOSTabsActive());

    expect(result.current).toBe(true);
  });
});

describe('useNativeIOSHeadersActive', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetAppPreferencesStoreForTests();
    mockCanUseLiquidGlass.mockReset();
  });

  it('is true when liquid glass is unavailable (classic native header)', () => {
    mockCanUseLiquidGlass.mockReturnValue(false);

    const { result } = renderHook(() => useNativeIOSHeadersActive());

    expect(result.current).toBe(true);
  });

  it('is false when liquid glass is available but the toggle is disabled', () => {
    mockCanUseLiquidGlass.mockReturnValue(true);

    const { result } = renderHook(() => useNativeIOSHeadersActive());

    expect(result.current).toBe(false);
  });

  it('is true when liquid glass is available and the toggle is enabled', () => {
    mockCanUseLiquidGlass.mockReturnValue(true);
    useAppPreferencesStore.getState().setLiquidGlassTabBarEnabled(true);

    const { result } = renderHook(() => useNativeIOSHeadersActive());

    expect(result.current).toBe(true);
  });
});
