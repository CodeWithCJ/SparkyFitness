import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { useCancelNfcOnBlur } from '../../src/hooks/useCancelNfcOnBlur';
import { cancelNfcRequest } from '../../src/services/nfc/nfcService';

jest.mock('../../src/services/nfc/nfcService', () => ({
  cancelNfcRequest: jest.fn(() => Promise.resolve()),
}));

/** Just enough of a navigation object for the real useFocusEffect. */
function fakeNavigation() {
  const listeners: Record<string, (() => void)[]> = { focus: [], blur: [] };
  let focused = true;
  const navigation = {
    isFocused: () => focused,
    addListener: (event: string, listener: () => void) => {
      listeners[event].push(listener);
      return () => {
        listeners[event] = listeners[event].filter((l) => l !== listener);
      };
    },
  };
  const emit = (event: 'focus' | 'blur') => {
    focused = event === 'focus';
    act(() => listeners[event].forEach((listener) => listener()));
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NavigationContext.Provider value={navigation as never}>
      {children}
    </NavigationContext.Provider>
  );
  return { emit, wrapper };
}

describe('useCancelNfcOnBlur', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancels a request still waiting when another screen opens on top', () => {
    const { emit, wrapper } = fakeNavigation();
    renderHook(() => useCancelNfcOnBlur(true), { wrapper });
    emit('blur');
    expect(cancelNfcRequest).toHaveBeenCalledTimes(1);
  });

  it('cancels a request still waiting when the screen goes away', () => {
    const { wrapper } = fakeNavigation();
    const { unmount } = renderHook(() => useCancelNfcOnBlur(true), { wrapper });
    unmount();
    expect(cancelNfcRequest).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no tag was being waited for', () => {
    const { emit, wrapper } = fakeNavigation();
    const { unmount } = renderHook(() => useCancelNfcOnBlur(false), {
      wrapper,
    });
    emit('blur');
    unmount();
    expect(cancelNfcRequest).not.toHaveBeenCalled();
  });

  it('follows the latest state, so a finished request is not cancelled again', () => {
    const { emit, wrapper } = fakeNavigation();
    const { rerender, unmount } = renderHook(
      ({ waiting }: { waiting: boolean }) => useCancelNfcOnBlur(waiting),
      { initialProps: { waiting: true }, wrapper }
    );
    rerender({ waiting: false });
    emit('blur');
    unmount();
    expect(cancelNfcRequest).not.toHaveBeenCalled();
  });
});
