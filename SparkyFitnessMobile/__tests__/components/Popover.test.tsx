import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import Popover from '../../src/components/Popover';

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

const anchor = { x: 20, y: 100, width: 300, height: 44 };

describe('Popover', () => {
  it('renders nothing when not visible', () => {
    const { queryByText } = render(
      <Popover visible={false} anchor={anchor} onDismiss={jest.fn()} title="Heading">
        Body text
      </Popover>,
    );
    expect(queryByText('Heading')).toBeNull();
    expect(queryByText('Body text')).toBeNull();
  });

  it('renders nothing when the anchor is missing', () => {
    const { queryByText } = render(
      <Popover visible anchor={null} onDismiss={jest.fn()} title="Heading">
        Body text
      </Popover>,
    );
    expect(queryByText('Heading')).toBeNull();
  });

  it('renders the title, string body, and a default dismiss button when visible', () => {
    const { getByText } = render(
      <Popover visible anchor={anchor} onDismiss={jest.fn()} title="Heading">
        Body text
      </Popover>,
    );
    expect(getByText('Heading')).toBeTruthy();
    expect(getByText('Body text')).toBeTruthy();
    expect(getByText('Got it')).toBeTruthy();
  });

  it('calls onDismiss when the dismiss button is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(
      <Popover visible anchor={anchor} onDismiss={onDismiss}>
        Body text
      </Popover>,
    );
    fireEvent.press(getByText('Got it'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders a custom dismiss label', () => {
    const { getByText } = render(
      <Popover visible anchor={anchor} onDismiss={jest.fn()} dismissLabel="Close">
        Body text
      </Popover>,
    );
    expect(getByText('Close')).toBeTruthy();
  });

  it('hides the dismiss button when showDismissButton is false', () => {
    const { queryByText, getByText } = render(
      <Popover
        visible
        anchor={anchor}
        onDismiss={jest.fn()}
        showDismissButton={false}
      >
        Body text
      </Popover>,
    );
    expect(queryByText('Got it')).toBeNull();
    // The body still renders; only the button is gone.
    expect(getByText('Body text')).toBeTruthy();
  });
});
