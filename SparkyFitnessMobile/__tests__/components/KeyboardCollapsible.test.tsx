import React from 'react';
import { Text } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { render, fireEvent } from '@testing-library/react-native';
import KeyboardCollapsible from '../../src/components/KeyboardCollapsible';

const mockProgress = { value: 0 };

jest.mock('react-native-keyboard-controller', () => ({
  useReanimatedKeyboardAnimation: () => ({
    height: { value: 0 },
    progress: mockProgress,
  }),
}));

const mockedUseAnimatedReaction = useAnimatedReaction as jest.Mock;

const fireLayout = (element: any, height: number) => {
  fireEvent(element, 'layout', { nativeEvent: { layout: { height } } });
};

describe('KeyboardCollapsible', () => {
  beforeEach(() => {
    mockProgress.value = 0;
    // Run the reaction synchronously on each render so the component's
    // keyboard-engaged mirror tracks mockProgress (the global reanimated mock
    // leaves useAnimatedReaction inert and makes runOnJS an identity).
    mockedUseAnimatedReaction.mockImplementation(
      (prepare: () => unknown, react: (value: unknown, previous: unknown) => void) => {
        react(prepare(), null);
      },
    );
  });

  afterEach(() => {
    mockedUseAnimatedReaction.mockReset();
  });

  it('renders at auto height before the child is measured', () => {
    const { getByTestId } = render(
      <KeyboardCollapsible>
        <Text>content</Text>
      </KeyboardCollapsible>,
    );

    expect(getByTestId('keyboard-collapsible-clip').props.style.height).toBeUndefined();
  });

  it('clips to the measured height once the child lays out', () => {
    const { getByTestId } = render(
      <KeyboardCollapsible>
        <Text>content</Text>
      </KeyboardCollapsible>,
    );

    fireLayout(getByTestId('keyboard-collapsible-content'), 20);

    expect(getByTestId('keyboard-collapsible-clip').props.style.height).toBe(20);
  });

  it('ignores partial-height layouts while the keyboard is up', () => {
    // Fresh elements per (re)render — an identical element reference makes
    // React bail out of re-rendering, which would skip the reaction mock.
    const ui = () => (
      <KeyboardCollapsible>
        <Text>content</Text>
      </KeyboardCollapsible>
    );
    const { getByTestId, rerender } = render(ui());

    fireLayout(getByTestId('keyboard-collapsible-content'), 20);

    // Android re-lays the measured child out at partial heights while the
    // collapse animation runs; those events must not replace the natural
    // height or the restored bar ratchets shorter on every keyboard cycle.
    mockProgress.value = 1;
    rerender(ui());
    fireLayout(getByTestId('keyboard-collapsible-content'), 4);

    mockProgress.value = 0;
    rerender(ui());

    expect(getByTestId('keyboard-collapsible-clip').props.style.height).toBe(20);
  });
});
