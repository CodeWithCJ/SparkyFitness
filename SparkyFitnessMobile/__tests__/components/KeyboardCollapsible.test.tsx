import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import KeyboardCollapsible from '../../src/components/KeyboardCollapsible';

const mockProgress = { value: 0 };

jest.mock('react-native-keyboard-controller', () => ({
  useReanimatedKeyboardAnimation: () => ({
    height: { value: 0 },
    progress: mockProgress,
  }),
}));

const fireLayout = (element: any, height: number) => {
  fireEvent(element, 'layout', { nativeEvent: { layout: { height } } });
};

describe('KeyboardCollapsible', () => {
  beforeEach(() => {
    mockProgress.value = 0;
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
    const tree = (
      <KeyboardCollapsible>
        <Text>content</Text>
      </KeyboardCollapsible>
    );
    const { getByTestId, rerender } = render(tree);

    fireLayout(getByTestId('keyboard-collapsible-content'), 20);

    // Android re-lays the measured child out at partial heights while the
    // collapse animation runs; those events must not replace the natural
    // height or the restored bar ratchets shorter on every keyboard cycle.
    mockProgress.value = 1;
    fireLayout(getByTestId('keyboard-collapsible-content'), 4);

    mockProgress.value = 0;
    rerender(tree);

    expect(getByTestId('keyboard-collapsible-clip').props.style.height).toBe(20);
  });
});
