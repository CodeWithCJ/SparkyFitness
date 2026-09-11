import { vi, beforeEach, describe, expect, it } from 'vitest';
import pregnancyRepository from '../models/pregnancyRepository.js';
import pregnancyService from '../services/pregnancyService.js';

vi.mock('../models/pregnancyRepository.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const PHOTO_ID = '11111111-1111-4111-8111-111111111111';

describe('pregnancyService.getPhotoFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when the caller owns no such photo', async () => {
    vi.mocked(pregnancyRepository.getPhotoFilePath).mockResolvedValue(null);
    await expect(
      pregnancyService.getPhotoFile('user-1', PHOTO_ID)
    ).resolves.toBeNull();
  });

  // A tampered or corrupted file_path must never escape the uploads root.
  it.each([
    'uploads/../../etc/passwd',
    'uploads/pregnancy/../../../../etc/passwd',
    '/etc/passwd',
  ])('refuses a path escaping the uploads root: %s', async (stored) => {
    vi.mocked(pregnancyRepository.getPhotoFilePath).mockResolvedValue(stored);
    await expect(
      pregnancyService.getPhotoFile('user-1', PHOTO_ID)
    ).resolves.toBeNull();
  });

  // Photos written before the SPARKY_FITNESS_UPLOADS_DIR fix on a custom
  // uploads directory resolve to a path that is not on disk.
  it('returns null when the row points at a file that is gone', async () => {
    vi.mocked(pregnancyRepository.getPhotoFilePath).mockResolvedValue(
      'uploads/pregnancy/user-1/preg-1/w12-does-not-exist.jpg'
    );
    await expect(
      pregnancyService.getPhotoFile('user-1', PHOTO_ID)
    ).resolves.toBeNull();
  });
});

describe('pregnancyService.deletePhoto', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports false when nothing was deleted', async () => {
    vi.mocked(pregnancyRepository.deletePhoto).mockResolvedValue(null);
    await expect(
      pregnancyService.deletePhoto('user-1', PHOTO_ID)
    ).resolves.toBe(false);
  });

  // The row is the source of truth: a missing file must not fail the request.
  it('still succeeds when the file is already gone from disk', async () => {
    vi.mocked(pregnancyRepository.deletePhoto).mockResolvedValue(
      'uploads/pregnancy/user-1/preg-1/w12-does-not-exist.jpg'
    );
    await expect(
      pregnancyService.deletePhoto('user-1', PHOTO_ID)
    ).resolves.toBe(true);
  });
});
