import { AppState, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useVoicePreferencesRefresh } from '../../src/hooks/useVoicePreferencesRefresh';
import { useRefetchOnFocus } from '../../src/hooks/useRefetchOnFocus';

jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

it('refetches on screen focus and foreground return, then removes its listener', () => {
  const refetch = jest.fn();
  const remove = jest.fn();
  let listener: ((status: AppStateStatus) => void) | undefined;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      listener = callback;
      return { remove };
    });
  const { unmount } = renderHook(() => useVoicePreferencesRefresh(refetch));
  expect(useRefetchOnFocus).toHaveBeenCalledWith(refetch, true, 0);
  act(() => listener?.('background'));
  expect(refetch).not.toHaveBeenCalled();
  act(() => listener?.('active'));
  expect(refetch).toHaveBeenCalledTimes(1);
  unmount();
  expect(remove).toHaveBeenCalled();
});

it('does not refresh while no server is configured', () => {
  const refetch = jest.fn();
  const listener = jest.spyOn(AppState, 'addEventListener');
  renderHook(() => useVoicePreferencesRefresh(refetch, false));
  expect(useRefetchOnFocus).toHaveBeenCalledWith(refetch, false, 0);
  expect(listener).not.toHaveBeenCalled();
});
