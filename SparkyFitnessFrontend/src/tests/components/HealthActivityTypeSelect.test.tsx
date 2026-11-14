import { fireEvent, render, screen } from '@testing-library/react';
import { HealthActivityTypeSelect } from '@/components/HealthActivityTypeSelect';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      fallback: string,
      vars?: Record<string, string>
    ): string =>
      vars
        ? fallback.replace(/\{\{(\w+)\}\}/g, (_m, name) => vars[name] ?? '')
        : fallback,
  }),
}));

const open = (onChange = jest.fn()) => {
  render(
    <HealthActivityTypeSelect
      id="hat"
      value="automatic"
      onChange={onChange}
      exercise={{ name: 'Walking into Mordor', modality: 'duration' }}
    />
  );
  fireEvent.click(screen.getByRole('combobox'));
  return onChange;
};

describe('HealthActivityTypeSelect (#1750)', () => {
  it('shows the guessed type as Automatic', () => {
    open();
    expect(screen.getAllByText('Automatic (Walking)').length).toBeGreaterThan(
      0
    );
  });

  it('lists Common first, then every activity', () => {
    open();
    expect(screen.getByText('Common')).toBeTruthy();
    expect(screen.getByText('All activities')).toBeTruthy();
    expect(screen.getByText('Pickleball')).toBeTruthy();
  });

  it('filters as you type, listing each match once', () => {
    open();
    fireEvent.change(screen.getByLabelText('Search activities'), {
      target: { value: 'treadmill' },
    });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Treadmill Running',
    ]);
    expect(screen.queryByText('Common')).toBeNull();
  });

  it('says when nothing matches', () => {
    open();
    fireEvent.change(screen.getByLabelText('Search activities'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('picks the first match on Enter', () => {
    const onChange = open();
    const search = screen.getByLabelText('Search activities');
    fireEvent.change(search, { target: { value: 'yoga' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('yoga');
  });
});
