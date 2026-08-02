import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { ToastConfigParams } from 'react-native-toast-message';
import { toastConfig } from '../../../src/components/ui/toastConfig';

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

function buildParams(overrides: Partial<ToastConfigParams<unknown>> = {}): ToastConfigParams<unknown> {
  return {
    position: 'top',
    type: 'success',
    isVisible: true,
    text1: 'Lisinopril logged',
    text2: undefined,
    show: jest.fn(),
    hide: jest.fn(),
    onPress: jest.fn(),
    props: undefined,
    ...overrides,
  };
}

describe('toastConfig', () => {
  it('renders text without a tap target by default', () => {
    const screen = render(<>{toastConfig.success!(buildParams())}</>);

    expect(screen.getByText('Lisinopril logged')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes tappable when an action is passed through props', () => {
    const onPress = jest.fn();
    const screen = render(
      <>{toastConfig.success!(buildParams({ text2: 'Tap to undo', props: { onPress } }))}</>,
    );

    expect(screen.getByText('Tap to undo')).toBeTruthy();
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });
});
