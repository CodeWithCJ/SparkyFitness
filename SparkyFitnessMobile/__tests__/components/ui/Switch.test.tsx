import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import Switch from '../../../src/components/ui/Switch';

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? ['#2563EB', '#D1D5DB'] : '#2563EB',
}));

describe('Switch', () => {
  it('renders at full opacity while enabled', () => {
    const { getByRole } = render(
      <Switch value={false} onValueChange={jest.fn()} />
    );

    const style = StyleSheet.flatten(getByRole('switch').props.style);
    expect(style.opacity).toBeUndefined();
  });

  it('dims the control while disabled', () => {
    // The theme colors we pass beat the platform's own disabled styling, so
    // without this the switch stays fully coloured and looks tappable.
    const { getByRole } = render(
      <Switch value onValueChange={jest.fn()} disabled />
    );

    const toggle = getByRole('switch');
    expect(toggle.props.disabled).toBe(true);
    expect(StyleSheet.flatten(toggle.props.style).opacity).toBe(0.4);
  });

  it('keeps a caller-provided style alongside the disabled dimming', () => {
    const { getByRole } = render(
      <Switch
        value
        onValueChange={jest.fn()}
        disabled
        style={{ marginLeft: 8 }}
      />
    );

    const style = StyleSheet.flatten(getByRole('switch').props.style);
    expect(style.opacity).toBe(0.4);
    expect(style.marginLeft).toBe(8);
  });
});
