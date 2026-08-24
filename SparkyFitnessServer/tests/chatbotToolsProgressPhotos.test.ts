import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone } from '@workspace/shared';
import { buildProgressPhotoTools } from '../ai/tools/progressPhotoTools.js';
import checkInPhotoService from '../services/checkInPhotoService.js';

vi.mock('../services/checkInPhotoService', () => ({
  default: {
    getPhotoDates: vi.fn(),
    getPhotosByDate: vi.fn(),
    deletePhoto: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const svc = checkInPhotoService as unknown as {
  getPhotoDates: ReturnType<typeof vi.fn>;
  getPhotosByDate: ReturnType<typeof vi.fn>;
  deletePhoto: ReturnType<typeof vi.fn>;
};

const opts = { toolCallId: 'tc-1', messages: [] };
const PHOTO_ID = '123e4567-e89b-12d3-a456-426614174000';
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildProgressPhotoTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildProgressPhotoTools('user-1', 'UTC');
});

describe('sparky_manage_progress_photos', () => {
  it('list_photo_dates renders the days with photos', async () => {
    svc.getPhotoDates.mockResolvedValue(['2026-02-03', '2026-02-01']);

    const result = await tools.sparky_manage_progress_photos.execute!(
      { action: 'list_photo_dates' },
      opts
    );

    expect(result).toBe(
      '# Progress Photo Dates\n\n**2026-02-03**\n\n**2026-02-01**'
    );
    expect(svc.getPhotoDates).toHaveBeenCalledWith('user-1');
  });

  it('list_photo_dates reports when there are none', async () => {
    svc.getPhotoDates.mockResolvedValue([]);

    const result = await tools.sparky_manage_progress_photos.execute!(
      { action: 'list_photo_dates' },
      opts
    );

    expect(result).toBe('# Progress Photo Dates\n\nNo results found.');
  });

  it('infers list_photo_dates when no action or fields are provided', async () => {
    svc.getPhotoDates.mockResolvedValue([]);

    const result = await tools.sparky_manage_progress_photos.execute!({}, opts);

    expect(result).toBe('# Progress Photo Dates\n\nNo results found.');
  });

  it('list_photos renders the photos for an explicit date', async () => {
    svc.getPhotosByDate.mockResolvedValue([
      {
        id: 'p1',
        photo_type: 'front',
        entry_date: '2026-02-01',
        created_at: '2026-02-01T08:00:00Z',
      },
      {
        id: 'p2',
        photo_type: 'back',
        entry_date: '2026-02-01',
        created_at: '2026-02-01T08:01:00Z',
      },
    ]);

    const result = await tools.sparky_manage_progress_photos.execute!(
      { action: 'list_photos', date: '2026-02-01' },
      opts
    );

    expect(result).toBe(
      '# Progress Photos (2026-02-01)\n\n' +
        '**front** (2026-02-01)\n  ID: p1\n\n' +
        '**back** (2026-02-01)\n  ID: p2'
    );
    expect(svc.getPhotosByDate).toHaveBeenCalledWith('user-1', '2026-02-01');
  });

  it('list_photos defaults to today when no date is provided', async () => {
    svc.getPhotosByDate.mockResolvedValue([]);
    const today = todayInZone('UTC');

    const result = await tools.sparky_manage_progress_photos.execute!(
      { action: 'list_photos' },
      opts
    );

    expect(result).toBe(`# Progress Photos (${today})\n\nNo results found.`);
    expect(svc.getPhotosByDate).toHaveBeenCalledWith('user-1', today);
  });

  it('delete_photo confirms deletion', async () => {
    svc.deletePhoto.mockResolvedValue(undefined);

    const result = await tools.sparky_manage_progress_photos.execute!(
      { action: 'delete_photo', photo_id: PHOTO_ID },
      opts
    );

    expect(result).toBe('✅ Progress photo deleted.');
    expect(svc.deletePhoto).toHaveBeenCalledWith('user-1', PHOTO_ID);
  });

  it('infers delete_photo when a photo_id is provided', async () => {
    svc.deletePhoto.mockResolvedValue(undefined);

    const result = await tools.sparky_manage_progress_photos.execute!(
      { photo_id: PHOTO_ID },
      opts
    );

    expect(result).toBe('✅ Progress photo deleted.');
    expect(svc.deletePhoto).toHaveBeenCalledWith('user-1', PHOTO_ID);
  });

  it('delete_photo rejects a non-UUID photo_id', async () => {
    const result = await tools.sparky_manage_progress_photos.execute!(
      { action: 'delete_photo', photo_id: 'not-a-uuid' },
      opts
    );

    expect(result).toBe('Error [VALIDATION]: photo_id: Must be a valid UUID');
    expect(svc.deletePhoto).not.toHaveBeenCalled();
  });

  it('returns DB_ERROR when the service throws', async () => {
    svc.getPhotoDates.mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_manage_progress_photos.execute!(
      { action: 'list_photo_dates' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
