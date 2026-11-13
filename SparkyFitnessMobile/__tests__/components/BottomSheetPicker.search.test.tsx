import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import BottomSheetPicker from '../../src/components/BottomSheetPicker';

const sections = [
  {
    title: 'Common',
    options: [
      { label: 'Walking', value: 'walking' },
      { label: 'Running', value: 'running' },
    ],
  },
  {
    title: 'All activities',
    options: [
      { label: 'Pilates', value: 'pilates' },
      { label: 'Running', value: 'running' },
      { label: 'Tai Chi', value: 'tai_chi' },
      { label: 'Walking', value: 'walking' },
    ],
  },
];

const renderPicker = (searchable: boolean) =>
  render(
    <BottomSheetPicker<string>
      value="walking"
      sections={sections}
      onSelect={jest.fn()}
      searchable={searchable}
      searchPlaceholder="Search activities"
    />
  );

describe('BottomSheetPicker search', () => {
  it('shows no search field unless asked', () => {
    renderPicker(false);
    expect(screen.queryByLabelText('Search activities')).toBeNull();
    expect(screen.getByText('Common')).toBeTruthy();
  });

  it('filters by label, case-insensitively, listing a repeated option once', () => {
    renderPicker(true);
    fireEvent.changeText(screen.getByLabelText('Search activities'), 'RUN');
    expect(
      screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)
    ).toEqual(['Running']);
    expect(screen.queryByText('Common')).toBeNull();
  });

  it('ignores accents', () => {
    renderPicker(true);
    fireEvent.changeText(screen.getByLabelText('Search activities'), 'tái');
    expect(screen.getByLabelText('Tai Chi')).toBeTruthy();
  });

  it('says when nothing matches', () => {
    renderPicker(true);
    fireEvent.changeText(screen.getByLabelText('Search activities'), 'zzz');
    expect(screen.getByText('No matches')).toBeTruthy();
  });
});
