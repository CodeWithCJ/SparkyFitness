import {
  formatSignedWeightChange,
  framesForAngle,
  framesInRange,
  type PhotoType,
  type ProgressPhotoDay,
} from '@workspace/shared';
import {
  defaultAngle,
  formatWeightDelta,
  hasComparableAngle,
} from '@/utils/progressPhotos';

// framesForAngle, framesInRange and formatSignedWeightChange live in
// @workspace/shared (the mobile screens use them too); like the other shared
// utils they are tested from a consuming package.

// Builds a gallery day with photos for the given angles, ids derived from the
// date so each frame can be told apart.
const day = (
  entry_date: string,
  angles: PhotoType[],
  weight: number | null = null
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

describe('framesForAngle', () => {
  it('keeps only days with that angle, oldest first', () => {
    // The gallery arrives newest first.
    const days = [
      day('2026-03-20', ['front']),
      day('2026-03-10', ['back']),
      day('2026-03-01', ['front', 'back']),
    ];

    expect(framesForAngle(days, 'front').map((d) => d.entry_date)).toEqual([
      '2026-03-01',
      '2026-03-20',
    ]);
  });

  it('does not reorder the gallery it was given', () => {
    const days = [day('2026-03-20', ['front']), day('2026-03-01', ['front'])];
    framesForAngle(days, 'front');
    expect(days.map((d) => d.entry_date)).toEqual(['2026-03-20', '2026-03-01']);
  });
});

describe('defaultAngle', () => {
  it('picks the angle with the most shoots', () => {
    const days = [
      day('2026-03-20', ['side']),
      day('2026-03-10', ['side', 'front']),
      day('2026-03-01', ['side']),
    ];
    expect(defaultAngle(days)).toBe('side');
  });

  it('breaks ties in Front, Back, Side order', () => {
    const days = [day('2026-03-20', ['back', 'front'])];
    expect(defaultAngle(days)).toBe('front');
  });

  it('falls back to Front for an empty gallery', () => {
    expect(defaultAngle([])).toBe('front');
  });
});

describe('hasComparableAngle', () => {
  it('needs two days of the same angle', () => {
    expect(
      hasComparableAngle([
        day('2026-03-20', ['front']),
        day('2026-03-01', ['back']),
      ])
    ).toBe(false);
    expect(
      hasComparableAngle([
        day('2026-03-20', ['back']),
        day('2026-03-01', ['back']),
      ])
    ).toBe(true);
  });

  it('does not count three angles on one day as a comparison', () => {
    expect(
      hasComparableAngle([day('2026-03-20', ['front', 'back', 'side'])])
    ).toBe(false);
  });
});

describe('framesInRange', () => {
  const today = '2026-06-30';
  const frames = [
    day('2025-12-01', ['front']),
    day('2026-05-01', ['front']),
    day('2026-06-10', ['front']),
    day('2026-06-25', ['front']),
  ];
  const dates = (result: { frames: ProgressPhotoDay[] }) =>
    result.frames.map((d) => d.entry_date);

  it('plays everything for All time', () => {
    const result = framesInRange(frames, 'all', today, null);
    expect(dates(result)).toHaveLength(4);
    expect(result.widened).toBe(false);
  });

  it('keeps the last 30 days, both ends inclusive', () => {
    const result = framesInRange(
      // Oldest first, like framesForAngle hands it over; 2026-05-31 is the
      // first day inside the window.
      [...frames.slice(0, 2), day('2026-05-31', ['front']), ...frames.slice(2)],
      '30d',
      today,
      null
    );
    expect(dates(result)).toEqual(['2026-05-31', '2026-06-10', '2026-06-25']);
    expect(result.widened).toBe(false);
  });

  it('keeps the last 3 months', () => {
    const result = framesInRange(frames, '3m', today, null);
    expect(dates(result)).toEqual(['2026-05-01', '2026-06-10', '2026-06-25']);
  });

  it('widens a preset with fewer than two frames to the whole history', () => {
    const old = [day('2025-01-01', ['front']), day('2025-02-01', ['front'])];
    const result = framesInRange(old, '30d', today, null);
    expect(dates(result)).toEqual(['2025-01-01', '2025-02-01']);
    expect(result.widened).toBe(true);
  });

  it('never widens a custom range, even when it is nearly empty', () => {
    const result = framesInRange(frames, 'custom', today, {
      from: '2026-06-01',
      to: '2026-06-15',
    });
    expect(dates(result)).toEqual(['2026-06-10']);
    expect(result.widened).toBe(false);
  });

  it('plays everything while a custom range has not been picked yet', () => {
    const result = framesInRange(frames, 'custom', today, null);
    expect(dates(result)).toHaveLength(4);
  });
});

describe('formatSignedWeightChange', () => {
  it('rounds to one decimal and signs gains', () => {
    expect(formatSignedWeightChange(1.04)).toBe('+1');
    expect(formatSignedWeightChange(-4.26)).toBe('-4.3');
  });

  it('shows no change without a sign', () => {
    expect(formatSignedWeightChange(0)).toBe('0');
    expect(formatSignedWeightChange(-0.01)).toBe('0');
  });
});

describe('formatWeightDelta', () => {
  it('signs the change in kg', () => {
    expect(formatWeightDelta(-4.26, 'kg')).toBe('-4.3 kg');
    expect(formatWeightDelta(1.04, 'kg')).toBe('+1 kg');
  });

  it('shows pounds for lbs and stone users', () => {
    expect(formatWeightDelta(-2, 'lbs')).toBe('-4.4 lbs');
    expect(formatWeightDelta(-2, 'st_lbs')).toBe('-4.4 lbs');
  });

  it('shows a change that rounds to nothing without a sign', () => {
    expect(formatWeightDelta(-0.01, 'kg')).toBe('0 kg');
  });
});
