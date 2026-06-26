import React from 'react';
import { ActivityIndicator } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ToolCallCard from '../../../src/components/chat/ToolCallCard';

// Render Icon as a Text tagged with its semantic name so status/chevron/tool
// icons are easy to assert (the real Icon maps to SF Symbols / Ionicons).
jest.mock('../../../src/components/Icon', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) =>
      React.createElement(Text, { testID: `icon-${name}` }, name),
  };
});

const baseFoodPart = {
  type: 'tool-call' as const,
  toolCallId: 'call-1',
  toolName: 'sparky_manage_food',
  args: {},
  argsText: '{"name":"eggs"}',
};

const LOGGED = '✅ Logged "2 eggs" (100 g) for breakfast on 2026-06-26.';

describe('ToolCallCard', () => {
  it('shows the friendly label + tool icon for a known tool', () => {
    const { getByText, getByTestId } = render(
      <ToolCallCard part={{ ...baseFoodPart, result: LOGGED }} />
    );
    expect(getByText('Food')).toBeTruthy();
    expect(getByTestId('icon-food')).toBeTruthy();
  });

  it('is collapsed by default and expands to the result string on press', () => {
    const { queryByText, getByText, getByTestId } = render(
      <ToolCallCard part={{ ...baseFoodPart, result: LOGGED }} />
    );
    // Collapsed: result hidden, chevron points forward.
    expect(queryByText(LOGGED)).toBeNull();
    expect(getByTestId('icon-chevron-forward')).toBeTruthy();

    fireEvent.press(getByText('Food'));

    // Expanded: result shown, chevron points down.
    expect(getByText(LOGGED)).toBeTruthy();
    expect(getByTestId('icon-chevron-down')).toBeTruthy();
  });

  it('renders a spinner while running (no result, no error)', () => {
    const { UNSAFE_getByType, queryByTestId } = render(<ToolCallCard part={baseFoodPart} />);
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(queryByTestId('icon-checkmark-circle')).toBeNull();
    expect(queryByTestId('icon-alert-circle')).toBeNull();
  });

  it('renders a success indicator when a result is present', () => {
    const { getByTestId, UNSAFE_queryByType } = render(
      <ToolCallCard part={{ ...baseFoodPart, result: LOGGED }} />
    );
    expect(getByTestId('icon-checkmark-circle')).toBeTruthy();
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });

  it('renders an error indicator when isError is set', () => {
    const { getByTestId, UNSAFE_queryByType } = render(
      <ToolCallCard part={{ ...baseFoodPart, result: 'Failed to log', isError: true }} />
    );
    expect(getByTestId('icon-alert-circle')).toBeTruthy();
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });

  it('stringifies a non-string result as JSON when expanded', () => {
    const { getByText } = render(
      <ToolCallCard part={{ ...baseFoodPart, result: { ok: true, id: 7 } }} />
    );
    fireEvent.press(getByText('Food'));
    expect(getByText(/"ok": true/)).toBeTruthy();
  });
});
