import React from 'react';
import { render } from '@testing-library/react-native';
import EntryImageOverride from '../../src/components/EntryImageOverride';

jest.mock('../../src/components/FoodImageSourceProvider', () => ({
  useFoodImageSourceContext: () => (path: string) => ({
    uri: `https://server/api${path}`,
    headers: {},
  }),
}));

describe('EntryImageOverride', () => {
  const noop = () => {};

  it('shows the inherited food photos when the entry has no override', () => {
    const { queryAllByTestId, getByText } = render(
      <EntryImageOverride
        images={null}
        inheritedImages={['/uploads/foods/f/1.jpg', '/uploads/foods/f/2.jpg']}
        onSave={noop}
        onClear={noop}
      />,
    );

    expect(queryAllByTestId('food-thumbnail')).toHaveLength(2);
    expect(
      getByText('Add a photo to set one for this entry.'),
    ).toBeTruthy();
  });

  it('shows the override instead of the parent photos when one is set', () => {
    // The inherited tiles must disappear: the entry is no longer displaying
    // them, and leaving them visible would misrepresent what is saved.
    const { queryAllByTestId, queryByText, getByTestId } = render(
      <EntryImageOverride
        images={['/uploads/food_entries/e/1.jpg']}
        inheritedImages={['/uploads/foods/f/1.jpg']}
        onSave={noop}
        onClear={noop}
      />,
    );

    expect(
      queryByText('Add a photo to set one for this entry.'),
    ).toBeNull();
    expect(queryAllByTestId('food-thumbnail')).toHaveLength(0);
    expect(getByTestId('food-image-tile-0')).toBeTruthy();
  });

  it('renders a plain picker when neither the entry nor the parent has a photo', () => {
    const { queryByText, getByTestId } = render(
      <EntryImageOverride
        images={null}
        inheritedImages={null}
        onSave={noop}
        onClear={noop}
      />,
    );

    expect(
      queryByText('Add a photo to set one for this entry.'),
    ).toBeNull();
    expect(getByTestId('food-image-add')).toBeTruthy();
  });
});
