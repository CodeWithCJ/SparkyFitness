import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { FoodPortionDefinition } from '@workspace/shared';
import NamedFoodPortionsSection from '../../src/components/NamedFoodPortionsSection';

function Editor({
  initialItems = [],
}: {
  initialItems?: FoodPortionDefinition[];
}) {
  const [items, setItems] = useState<FoodPortionDefinition[]>(initialItems);
  return (
    <NamedFoodPortionsSection
      items={items}
      onChange={setItems}
      servingUnit="g"
    />
  );
}

describe('named food portions', () => {
  it.each([
    ['big packet', ' big  packet '],
    ['big  packet', 'BIG packet'],
  ])(
    'rejects a whitespace-equivalent duplicate of %s',
    (existing, duplicate) => {
      const screen = render(
        <Editor initialItems={[{ name: existing, amount: 150, unit: 'g' }]} />
      );
      fireEvent.press(screen.getByText('+ Add portion'));
      fireEvent.changeText(screen.getByLabelText('Portion name'), duplicate);
      fireEvent.changeText(screen.getByLabelText('Portion amount'), '150');
      fireEvent.press(screen.getByText('Add portion'));

      expect(screen.getAllByLabelText(/^Remove portion /)).toHaveLength(1);
    }
  );

  it('stores a portion name using the same whitespace normalization as persistence', () => {
    const onChange = jest.fn();
    const screen = render(
      <NamedFoodPortionsSection
        items={[]}
        onChange={onChange}
        servingUnit="g"
      />
    );
    fireEvent.press(screen.getByText('+ Add portion'));
    fireEvent.changeText(
      screen.getByLabelText('Portion name'),
      ' big  packet '
    );
    fireEvent.changeText(screen.getByLabelText('Portion amount'), '150');
    fireEvent.press(screen.getByText('Add portion'));

    expect(onChange).toHaveBeenCalledWith([
      { name: 'big packet', amount: 150, unit: 'g' },
    ]);
  });

  it('stages a named gram portion and allows removing it before saving', () => {
    const screen = render(<Editor />);
    fireEvent.press(screen.getByText('+ Add portion'));
    fireEvent.changeText(screen.getByLabelText('Portion name'), 'packet');
    fireEvent.changeText(screen.getByLabelText('Portion amount'), '150');
    fireEvent.press(screen.getByText('Add portion'));

    expect(screen.getByText('1 packet = 150 g')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Remove portion packet'));
    expect(screen.queryByText('1 packet = 150 g')).toBeNull();
  });

  it('does not accept a portion without a positive weight', () => {
    const onChange = jest.fn();
    const screen = render(
      <NamedFoodPortionsSection
        items={[]}
        onChange={onChange}
        servingUnit="g"
      />
    );
    fireEvent.press(screen.getByText('+ Add portion'));
    fireEvent.changeText(screen.getByLabelText('Portion name'), 'packet');
    fireEvent.changeText(screen.getByLabelText('Portion amount'), '0');
    fireEvent.press(screen.getByText('Add portion'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
