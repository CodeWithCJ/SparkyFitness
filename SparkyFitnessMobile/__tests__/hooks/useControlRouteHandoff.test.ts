import { renderHook } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';
import { useControlRouteHandoff } from '../../src/hooks/useQuickActions';

const mockStore: { value: string | null } = { value: null };
const mockRemove = jest.fn(() => {
  mockStore.value = null;
});

jest.mock('@bacons/apple-targets', () => ({
  ExtensionStorage: jest.fn().mockImplementation(() => ({
    get: () => mockStore.value,
    remove: (key: string) => mockRemove(key),
  })),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { iosAppGroup: 'group.test' } } },
}));
jest.mock('expo-quick-actions', () => ({
  setItems: jest.fn(() => Promise.resolve()),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  initial: undefined,
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));

describe('useControlRouteHandoff', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.value = null;
    Platform.OS = 'ios';
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('opens the scanner when the Scan food control left that note', () => {
    mockStore.value = 'scan';
    renderHook(() => useControlRouteHandoff(true));
    expect(navigationRef.navigate).toHaveBeenCalledWith('FoodScan');
    expect(mockRemove).toHaveBeenCalledWith('pendingControlRoute');
  });

  it('opens food search for the Log food control', () => {
    mockStore.value = 'search';
    renderHook(() => useControlRouteHandoff(true));
    expect(navigationRef.navigate).toHaveBeenCalledWith('FoodSearch');
  });

  it('opens the food diary for the Calories left control', () => {
    mockStore.value = 'diary';
    renderHook(() => useControlRouteHandoff(true));
    expect(navigationRef.navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Diary',
    });
  });

  it('does nothing without a note, and ignores one it does not know', () => {
    renderHook(() => useControlRouteHandoff(true));
    mockStore.value = 'nonsense';
    renderHook(() => useControlRouteHandoff(true));
    expect(navigationRef.navigate).not.toHaveBeenCalled();
  });

  it('waits until it is enabled', () => {
    mockStore.value = 'scan';
    renderHook(() => useControlRouteHandoff(false));
    expect(navigationRef.navigate).not.toHaveBeenCalled();
  });

  it('picks the note up when the app comes back to the front', () => {
    let listener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      cb: (state: string) => void
    ) => {
      listener = cb;
      return { remove: jest.fn() };
    }) as never);
    renderHook(() => useControlRouteHandoff(true));
    expect(navigationRef.navigate).not.toHaveBeenCalled();
    mockStore.value = 'scan';
    listener?.('active');
    expect(navigationRef.navigate).toHaveBeenCalledWith('FoodScan');
  });
});
