import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import checkInPhotoService from '../services/checkInPhotoService.js';
import { getClient } from '../db/poolManager.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import { resolveUploadPath } from '../utils/uploadsPath.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));
vi.mock('../utils/permissionUtils', () => ({
  canAccessUserData: vi.fn(),
}));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: { ...actual.promises, access: vi.fn() },
    },
  };
});

describe('checkInPhotoService.getAllPhotosWithWeight', () => {
  let mockClient: MockDbClient;

  const withRows = (rows: unknown[]) => {
    mockClient.query.mockResolvedValue({ rows });
  };

  beforeEach(() => {
    mockClient = createMockDbClient([]);
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const sqlOf = () => mockClient.query.mock.calls[0][0] as string;
  const paramsOf = () => mockClient.query.mock.calls[0][1] as unknown[];

  it('joins the weight on (user_id, entry_date), not the measurement FK', async () => {
    await checkInPhotoService.getAllPhotosWithWeight('user-1');

    const sql = sqlOf().replace(/\s+/g, ' ');
    expect(sql).toContain('LEFT JOIN check_in_measurements m');
    expect(sql).toContain(
      'ON m.user_id = p.user_id AND m.entry_date = p.entry_date'
    );
    // The stored FK is only populated when a measurement row already existed at
    // upload time, so joining on it would report no weight forever for a photo
    // taken before that day's weight was entered.
    expect(sql).not.toContain('check_in_measurement_id');
    expect(paramsOf()).toEqual(['user-1']);
  });

  it('scopes the query to the caller and orders newest day first', async () => {
    await checkInPhotoService.getAllPhotosWithWeight('user-1');

    const sql = sqlOf().replace(/\s+/g, ' ');
    expect(sql).toContain('WHERE p.user_id = $1');
    expect(sql).toContain('ORDER BY p.entry_date DESC');
    expect(getClient).toHaveBeenCalledWith('user-1');
  });

  it('reports a null weight as null rather than NaN', async () => {
    withRows([
      { id: 'a', entry_date: '2026-03-01', photo_type: 'front', weight: null },
      {
        id: 'b',
        entry_date: '2026-03-01',
        photo_type: 'side',
        weight: undefined,
      },
    ]);

    const photos = await checkInPhotoService.getAllPhotosWithWeight('user-1');

    expect(photos[0].weight).toBeNull();
    expect(photos[1].weight).toBeNull();
  });

  it('keeps a real weight numeric, including zero', async () => {
    withRows([
      {
        id: 'a',
        entry_date: '2026-03-01',
        photo_type: 'front',
        weight: '82.4',
      },
      { id: 'b', entry_date: '2026-03-02', photo_type: 'front', weight: 0 },
    ]);

    const photos = await checkInPhotoService.getAllPhotosWithWeight('user-1');

    expect(photos[0].weight).toBe(82.4);
    // 0 is falsy but is a legitimate stored value, so it must survive the
    // null guard rather than being flattened to null.
    expect(photos[1].weight).toBe(0);
  });

  /**
   * pg hands back a Date for a `date` column. Formatting it through
   * toISOString() reports the UTC day, which is the wrong calendar day whenever
   * the offset pushes the instant across midnight — the photo would then pair
   * with the neighbouring day's weight.
   *
   * Two rows, because the shift goes opposite ways either side of Greenwich: a
   * late local evening rolls forward in UTC only for western offsets, an early
   * local morning rolls backward only for eastern ones. Between them one of the
   * two catches the bug in any zone with a non-zero offset. At UTC itself
   * neither can, so this file is also run under explicit zones:
   *
   *   TZ=America/Los_Angeles pnpm exec vitest run tests/checkInPhotoService.test.ts
   *   TZ=Pacific/Auckland pnpm exec vitest run tests/checkInPhotoService.test.ts
   */
  it('normalizes a Date entry_date to its local calendar day', async () => {
    const lateEvening = new Date(2026, 2, 15, 23, 30);
    const earlyMorning = new Date(2026, 2, 20, 0, 30);
    withRows([
      { id: 'a', entry_date: lateEvening, photo_type: 'front', weight: 80 },
      { id: 'b', entry_date: earlyMorning, photo_type: 'front', weight: 80 },
    ]);

    const photos = await checkInPhotoService.getAllPhotosWithWeight('user-1');

    expect(photos[0].entry_date).toBe('2026-03-15');
    expect(photos[1].entry_date).toBe('2026-03-20');
  });

  it('passes a string entry_date through untouched', async () => {
    withRows([
      { id: 'a', entry_date: '2026-03-15', photo_type: 'front', weight: 80 },
    ]);

    const photos = await checkInPhotoService.getAllPhotosWithWeight('user-1');

    expect(photos[0].entry_date).toBe('2026-03-15');
  });

  it('omits file_path so the on-disk layout stays a server detail', async () => {
    withRows([
      {
        id: 'a',
        entry_date: '2026-03-15',
        photo_type: 'front',
        weight: 80,
        file_path: 'uploads/check-in/user-1/2026-03-15/front.jpg',
      },
    ]);

    const photos = await checkInPhotoService.getAllPhotosWithWeight('user-1');

    expect(photos[0]).toEqual({
      id: 'a',
      entry_date: '2026-03-15',
      photo_type: 'front',
      weight: 80,
    });
    expect(sqlOf()).not.toContain('file_path');
  });

  it('releases the client even when the query throws', async () => {
    mockClient.query.mockRejectedValue(new Error('connection lost'));

    await expect(
      checkInPhotoService.getAllPhotosWithWeight('user-1')
    ).rejects.toThrow('connection lost');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

describe('checkInPhotoService.getPhotoFileById', () => {
  let mockClient: MockDbClient;
  const PHOTO = 'photo-1';
  const FILE_PATH = 'uploads/check-in/owner-1/2026-11-01/front.png';

  // The row the query returns, as a deployment whose app role bypasses RLS
  // would return it: whoever owns the photo.
  const ownedBy = (ownerId: string) => {
    mockClient.query.mockResolvedValue({
      rows: [{ user_id: ownerId, file_path: FILE_PATH }],
    });
  };

  beforeEach(() => {
    mockClient = createMockDbClient([]);
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
    // @ts-expect-error mock typing
    canAccessUserData.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('serves the owner without a family access lookup', async () => {
    ownedBy('owner-1');
    await expect(
      checkInPhotoService.getPhotoFileById('owner-1', PHOTO, 'owner-1')
    ).resolves.toBe(resolveUploadPath(FILE_PATH));
    expect(canAccessUserData).not.toHaveBeenCalled();
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it("refuses another user's photo when they have no check-in grant", async () => {
    ownedBy('owner-1');
    await expect(
      checkInPhotoService.getPhotoFileById('stranger', PHOTO, 'stranger')
    ).resolves.toBeNull();
    expect(canAccessUserData).toHaveBeenCalledWith(
      'owner-1',
      'checkin',
      'stranger'
    );
  });

  it("serves another user's photo to a family member with check-in access", async () => {
    ownedBy('owner-1');
    // @ts-expect-error mock typing
    canAccessUserData.mockResolvedValue(true);
    await expect(
      checkInPhotoService.getPhotoFileById('family-1', PHOTO, 'family-1')
    ).resolves.toBe(resolveUploadPath(FILE_PATH));
  });

  it('returns null when the photo does not exist', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    await expect(
      checkInPhotoService.getPhotoFileById('owner-1', PHOTO, 'owner-1')
    ).resolves.toBeNull();
    expect(canAccessUserData).not.toHaveBeenCalled();
  });
});
