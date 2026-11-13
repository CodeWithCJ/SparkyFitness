import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';

import { useTodayOnFocus } from '../../src/hooks/useTodayOnFocus';

let mockToday = '2026-10-20';
jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getTodayDate: () => mockToday,
}));

function fakeNavigation() {
  const listeners = new Set<() => void>();
  const unsubscribe = jest.fn();
  return {
    navigation: {
      addListener: jest.fn((event: string, listener: () => void) => {
        if (event === 'focus') listeners.add(listener);
        return () => {
          listeners.delete(listener);
          unsubscribe();
        };
      }),
    },
    focus: () => listeners.forEach((listener) => listener()),
    unsubscribe,
  };
}

describe('useTodayOnFocus', () => {
  beforeEach(() => {
    mockToday = '2026-10-20';
  });

  it('starts on today and works without a navigator', () => {
    const { result } = renderHook(() => useTodayOnFocus());
    expect(result.current).toBe('2026-10-20');
  });

  it('moves today forward when the screen is focused after midnight', () => {
    const nav = fakeNavigation();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationContext.Provider value={nav.navigation as never}>
        {children}
      </NavigationContext.Provider>
    );
    const { result, unmount } = renderHook(() => useTodayOnFocus(), {
      wrapper,
    });
    expect(result.current).toBe('2026-10-20');

    act(() => nav.focus());
    expect(result.current).toBe('2026-10-20');

    mockToday = '2026-10-21';
    act(() => nav.focus());
    expect(result.current).toBe('2026-10-21');

    unmount();
    expect(nav.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
