import { renderHook, waitFor } from '@testing-library/react-native';
import {
  groupPhotosByDay,
  useCheckInPhotoMutations,
} from '../../src/hooks/useCheckInPhotos';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';
import type { CheckInPhotoWithWeight } from '../../src/types/checkInPhotos';

jest.mock('../../src/services/api/checkInPhotosApi', () => ({
  uploadPhoto: jest.fn(async () => ({ id: 'p1' })),
  deletePhoto: jest.fn(async () => undefined),
}));

const photo = (
  overrides: Partial<CheckInPhotoWithWeight> & { id: string }
): CheckInPhotoWithWeight => ({
  entry_date: '2026-03-15',
  photo_type: 'front',
  weight: null,
  ...overrides,
});

describe('groupPhotosByDay', () => {
  it('folds every angle of a day into one entry', () => {
    const days = groupPhotosByDay([
      photo({ id: 'a', photo_type: 'front', weight: 80 }),
      photo({ id: 'b', photo_type: 'back', weight: 80 }),
      photo({ id: 'c', photo_type: 'side', weight: 80 }),
    ]);

    expect(days).toHaveLength(1);
    expect(days[0].entry_date).toBe('2026-03-15');
    expect(days[0].photos.front?.id).toBe('a');
    expect(days[0].photos.back?.id).toBe('b');
    expect(days[0].photos.side?.id).toBe('c');
  });

  it("preserves the server's newest-first order rather than re-sorting", () => {
    // The endpoint already orders by entry_date DESC. Re-sorting here would be
    // wasted work, and sorting the wrong way would silently invert the
    // timeline, the comparison defaults and the time-lapse.
    const days = groupPhotosByDay([
      photo({ id: 'c', entry_date: '2026-03-20' }),
      photo({ id: 'b', entry_date: '2026-03-15' }),
      photo({ id: 'a', entry_date: '2026-03-01' }),
    ]);

    expect(days.map((d) => d.entry_date)).toEqual([
      '2026-03-20',
      '2026-03-15',
      '2026-03-01',
    ]);
  });

  it('back-fills a day weight from a later row when the first one is null', () => {
    // Every row of a day carries the same joined weight, but ordering within a
    // day is by photo_type, so the first row is not guaranteed to be the one
    // that has it.
    const days = groupPhotosByDay([
      photo({ id: 'a', photo_type: 'back', weight: null }),
      photo({ id: 'b', photo_type: 'front', weight: 82.5 }),
    ]);

    expect(days[0].weight).toBe(82.5);
  });

  it('keeps a day weight of null when no row has one', () => {
    const days = groupPhotosByDay([
      photo({ id: 'a', photo_type: 'front', weight: null }),
      photo({ id: 'b', photo_type: 'side', weight: null }),
    ]);

    expect(days[0].weight).toBeNull();
  });

  it('keeps a stored weight of zero instead of treating it as missing', () => {
    const days = groupPhotosByDay([photo({ id: 'a', weight: 0 })]);

    expect(days[0].weight).toBe(0);
  });

  it('does not merge photos from different days', () => {
    const days = groupPhotosByDay([
      photo({ id: 'a', entry_date: '2026-03-20', weight: 80 }),
      photo({ id: 'b', entry_date: '2026-03-15', weight: 82 }),
    ]);

    expect(days).toHaveLength(2);
    expect(days[0].weight).toBe(80);
    expect(days[1].weight).toBe(82);
    expect(days[0].photos.front?.id).toBe('a');
    expect(days[1].photos.front?.id).toBe('b');
  });

  it('returns nothing for an empty gallery', () => {
    expect(groupPhotosByDay([])).toEqual([]);
  });
});

describe('useCheckInPhotoMutations', () => {
  it('stops reporting an angle as uploading once it finishes', async () => {
    // `variables` keeps the last call's arguments after the mutation settles,
    // so reading it unguarded pins a spinner on the slot that just succeeded.
    const wrapper = createQueryWrapper(createTestQueryClient());
    const { result } = renderHook(() => useCheckInPhotoMutations(), {
      wrapper,
    });

    await result.current.uploadAsync({
      date: '2026-03-20',
      type: 'front',
      uri: 'file:///a.jpg',
    });

    await waitFor(() => expect(result.current.isUploading).toBe(false));
    expect(result.current.uploadingType).toBeUndefined();
  });
});
