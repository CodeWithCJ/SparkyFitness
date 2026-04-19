import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import CustomTabBar from '../../src/components/CustomTabBar';
import { fireSheetOpenHaptic } from '../../src/services/haptics';

jest.mock('../../src/services/haptics', () => ({
  fireSelectionHaptic: jest.fn(),
  fireSheetOpenHaptic: jest.fn(),
  fireSuccessHaptic: jest.fn(),
}));

describe('CustomTabBar', () => {
  const mockFireSheetOpenHaptic = fireSheetOpenHaptic as jest.MockedFunction<
    typeof fireSheetOpenHaptic
  >;

  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  const createProps = (): BottomTabBarProps => {
    const routes = [
      { key: 'Dashboard-key', name: 'Dashboard' as const, params: undefined },
      { key: 'Diary-key', name: 'Diary' as const, params: undefined },
      { key: 'Add-key', name: 'Add' as const, params: undefined },
      { key: 'Workouts-key', name: 'Workouts' as const, params: undefined },
      { key: 'Settings-key', name: 'Settings' as const, params: undefined },
    ];

    const emit = jest.fn(({ target }: { target: string }) => ({
      defaultPrevented: target === 'Add-key',
    }));

    return {
      state: {
        stale: false,
        type: 'tab',
        key: 'tab-state',
        index: 0,
        routeNames: routes.map(route => route.name),
        history: [],
        routes,
      },
      descriptors: Object.fromEntries(
        routes.map(route => [
          route.key,
          {
            navigation: {} as never,
            route,
            options: route.name === 'Add'
              ? { tabBarAccessibilityLabel: 'Add' }
              : { title: route.name },
            render: jest.fn(),
          },
        ]),
      ) as BottomTabBarProps['descriptors'],
      navigation: {
        emit,
        navigate: jest.fn(),
      } as unknown as BottomTabBarProps['navigation'],
      insets,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fires a sheet-open haptic when the Add button is pressed', () => {
    const props = createProps();
    const screen = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <CustomTabBar {...props} />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByLabelText('Add'));

    expect(mockFireSheetOpenHaptic).toHaveBeenCalledTimes(1);
    expect(props.navigation.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'Add-key',
      canPreventDefault: true,
    });
    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });
});
