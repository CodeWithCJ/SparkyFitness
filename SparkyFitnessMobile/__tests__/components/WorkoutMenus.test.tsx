import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SetTypeMenu } from '../../src/components/WorkoutMenus';
import type { AnchorRect } from '../../src/components/AnchoredMenu';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

const ANCHOR: AnchorRect = { x: 0, y: 0, width: 10, height: 10 };

function renderMenu(props?: Partial<React.ComponentProps<typeof SetTypeMenu>>) {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const utils = render(
    <SetTypeMenu
      anchor={ANCHOR}
      currentType="normal"
      onClose={onClose}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { ...utils, onSelect, onClose };
}

describe('SetTypeMenu', () => {
  it('renders the set-type options', () => {
    const { getByLabelText } = renderMenu();
    // The current type is check-marked.
    expect(getByLabelText('✓ Normal')).toBeTruthy();
    expect(getByLabelText('Warmup')).toBeTruthy();
  });

  it('omits the Delete item unless onDelete is passed (form surfaces opt in)', () => {
    const { queryByLabelText } = renderMenu();
    expect(queryByLabelText('Delete set')).toBeNull();
  });

  it('renders and fires the optional Delete item when wired', () => {
    const onDelete = jest.fn();
    const { getByLabelText } = renderMenu({ onDelete });
    fireEvent.press(getByLabelText('Delete set'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
