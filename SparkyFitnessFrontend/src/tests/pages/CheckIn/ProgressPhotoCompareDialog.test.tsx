import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { PhotoType, ProgressPhotoDay } from '@workspace/shared';
import { ProgressPhotoCompareDialog } from '@/pages/CheckIn/ProgressPhotoCompareDialog';

let weightUnit = 'kg';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit,
    // Dates are shown as-is so the assertions can name them directly.
    formatDate: (date: string) => date,
    parseDateInUserTimezone: (date: string) => new Date(`${date}T00:00:00`),
  }),
}));

const day = (
  entry_date: string,
  angles: PhotoType[],
  weight: number | null
): ProgressPhotoDay => ({
  entry_date,
  weight,
  photos: Object.fromEntries(
    angles.map((angle) => [
      angle,
      { id: `${entry_date}-${angle}`, entry_date, photo_type: angle, weight },
    ])
  ),
});

// Newest first, as the gallery endpoint returns it.
const gallery = [
  day('2026-03-20', ['front'], 70),
  day('2026-03-10', ['front', 'back'], null),
  day('2026-03-01', ['front'], 72.5),
];

const renderDialog = (
  days: ProgressPhotoDay[] = gallery,
  onLogWeight?: (date: string) => void
) =>
  render(
    <ProgressPhotoCompareDialog
      open
      onOpenChange={jest.fn()}
      days={days}
      onLogWeight={onLogWeight}
    />
  );

describe('ProgressPhotoCompareDialog', () => {
  beforeEach(() => {
    weightUnit = 'kg';
  });

  it('opens on the first shoot against the latest one', () => {
    renderDialog();

    expect(screen.getByAltText('Before · 2026-03-01')).toHaveAttribute(
      'src',
      '/api/measurements/check-in-photos/file/2026-03-01-front'
    );
    expect(screen.getByAltText('After · 2026-03-20')).toHaveAttribute(
      'src',
      '/api/measurements/check-in-photos/file/2026-03-20-front'
    );
  });

  it('shows the weight change and how far apart the days are', () => {
    renderDialog();

    expect(screen.getByText('-2.5 kg')).toBeInTheDocument();
    expect(screen.getByText('19 days apart')).toBeInTheDocument();
  });

  it("shows the change in the user's weight unit", () => {
    weightUnit = 'lbs';
    renderDialog();

    expect(screen.getByText('-5.5 lbs')).toBeInTheDocument();
  });

  it('leaves the change out when either day has no weight', () => {
    renderDialog([
      day('2026-03-20', ['front'], 70),
      day('2026-03-01', ['front'], null),
    ]);

    // The day weights still show; only the signed change is missing.
    expect(screen.getByText('70 kg')).toBeInTheDocument();
    expect(screen.queryByText(/^[+-][\d.]+ kg$/)).not.toBeInTheDocument();
    expect(screen.getByText('19 days apart')).toBeInTheDocument();
  });

  it('offers to log a weight on a photo day without one', () => {
    const onLogWeight = jest.fn();
    renderDialog(
      [day('2026-03-20', ['front'], 70), day('2026-03-01', ['front'], null)],
      onLogWeight
    );

    fireEvent.click(screen.getByRole('button', { name: 'Log weight' }));

    expect(onLogWeight).toHaveBeenCalledWith('2026-03-01');
  });

  it('says so when the chosen angle has fewer than two days', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      screen.getByText(
        'Add photos of this angle on at least two days to compare them.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByAltText(/Before/)).not.toBeInTheDocument();
  });
});
