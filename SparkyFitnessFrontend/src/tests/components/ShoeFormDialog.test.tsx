import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ShoeResponse } from '@workspace/shared';
import { ShoeFormDialog } from '@/pages/Exercises/ShoeFormDialog';

let mockDistanceUnit = 'km';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    distanceUnit: mockDistanceUnit,
    convertDistance: (value: number, from: string, to: string) =>
      from === to ? value : from === 'km' ? value / 1.609344 : value * 1.609344,
  }),
}));

const shoe = {
  id: 'shoe-1',
  name: 'Trainer',
  starting_distance_km: 123.456789,
  retirement_distance_km: 800.123456,
  status: 'active',
  is_default: false,
} as ShoeResponse;

it.each(['km', 'miles'])(
  'preserves stored distances on a name-only edit in %s',
  async (unit) => {
    mockDistanceUnit = unit;
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <ShoeFormDialog
        open
        onOpenChange={jest.fn()}
        shoe={shoe}
        onSubmit={onSubmit}
        isSaving={false}
      />
    );
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Renamed',
          starting_distance_km: shoe.starting_distance_km,
          retirement_distance_km: shoe.retirement_distance_km,
        })
      )
    );
  }
);

it.each(['shoe-starting', 'shoe-retirement'])(
  'converts only the edited %s field',
  async (field) => {
    mockDistanceUnit = 'miles';
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <ShoeFormDialog
        open
        onOpenChange={jest.fn()}
        shoe={shoe}
        onSubmit={onSubmit}
        isSaving={false}
      />
    );
    // Dialog content is portalled outside the render container.
    const input = document.getElementById(field);
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: '100' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          starting_distance_km:
            field === 'shoe-starting'
              ? 100 * 1.609344
              : shoe.starting_distance_km,
          retirement_distance_km:
            field === 'shoe-retirement'
              ? 100 * 1.609344
              : shoe.retirement_distance_km,
        })
      )
    );
  }
);
