/**
 * An entry's stored image is deleted from disk when the image is replaced or
 * the entry is deleted. The stored path must only ever lead to an unused file
 * in the entry uploads directory, and only once the change has been saved.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadsDir } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'entry-images-'));
  process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = dir;
  return { uploadsDir: dir };
});

import exerciseEntryDb from '../models/exerciseEntry.js';
import exerciseService from '../services/exerciseService.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exerciseRepository', () => ({}));
vi.mock('../models/exercise', () => ({
  default: { getExerciseById: vi.fn() },
}));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    getExerciseEntryById: vi.fn(),
    getExerciseEntryOwnerId: vi.fn(),
    updateExerciseEntry: vi.fn(),
    deleteExerciseEntry: vi.fn(),
    isExerciseImageReferenced: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository', () => ({}));
vi.mock('../models/exercisePresetEntryRepository.js', () => ({
  default: {},
}));
vi.mock('../models/userRepository', () => ({}));
vi.mock('../models/preferenceRepository', () => ({}));
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../integrations/wger/wgerService', () => ({}));
vi.mock('../integrations/nutritionix/nutritionixService', () => ({}));
vi.mock('../integrations/freeexercisedb/FreeExerciseDBService', () => ({}));
vi.mock('../models/measurementRepository', () => ({}));
vi.mock('../utils/imageDownloader', () => ({ downloadImage: vi.fn() }));
vi.mock('../services/CalorieCalculationService', () => ({
  default: { estimateCaloriesBurnedPerHour: vi.fn() },
}));
vi.mock('../models/familyAccessRepository', () => ({
  checkFamilyAccessPermission: vi.fn(),
}));
vi.mock('../services/exerciseEntryHistoryService', () => ({
  getGroupedExerciseSessionById: vi.fn(),
  getGroupedExerciseSessionByIdWithClient: vi.fn(),
}));

const serverRoot = path.resolve(__dirname, '..');
const entryDir = path.join(uploadsDir, 'exercise_entries', '20261025');
const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'entry-outside-'));

/** Writes a file and returns its path in the stored `/uploads/...` form. */
function storedImage(name: string): string {
  fs.mkdirSync(entryDir, { recursive: true });
  fs.writeFileSync(path.join(entryDir, name), 'x');
  return `/uploads/exercise_entries/20261025/${name}`;
}

const onDisk = (imageUrl: string) =>
  fs.existsSync(path.join(uploadsDir, imageUrl.slice('/uploads/'.length)));

const entry = (imageUrl: string | null) => ({
  id: 'entry-1',
  user_id: 'user-1',
  exercise_id: null,
  image_url: imageUrl,
});

/** The model runs the service's callback against the row read under the lock. */
function updateWithLockedRow(locked: Record<string, unknown>) {
  vi.mocked(exerciseEntryDb.updateExerciseEntry).mockImplementation(
    async (_id, _user, _actor, _data, _marks, resolveUpdate) => {
      resolveUpdate?.(locked);
      return { id: 'entry-1' };
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(exerciseEntryDb.getExerciseEntryOwnerId).mockResolvedValue(
    'user-1'
  );
  vi.mocked(exerciseEntryDb.deleteExerciseEntry).mockResolvedValue(true);
  vi.mocked(exerciseEntryDb.isExerciseImageReferenced).mockResolvedValue(false);
});

afterAll(() => {
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
});

describe('deleting an exercise entry', () => {
  it('never deletes a file outside the entry uploads directory', async () => {
    const victim = path.join(outsideDir, 'victim.txt');
    fs.writeFileSync(victim, 'keep me');
    // Reaches the victim from the entry uploads directory, resolved either
    // against the configured uploads root or the server's own directory.
    const fromDefault = path.relative(
      path.join(serverRoot, 'uploads', 'exercise_entries'),
      victim
    );
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(
      entry(`/uploads/exercise_entries/${fromDefault}`)
    );

    await exerciseService.deleteExerciseEntry('user-1', 'entry-1');

    expect(fs.existsSync(victim)).toBe(true);
  });

  it.each([
    ['a .. segment', '/uploads/exercise_entries/20261025/../20261025/'],
    ['a doubled slash', '/uploads/exercise_entries/20261025//'],
  ])(
    'never deletes another spelling of a file through %s',
    async (_label, prefix) => {
      // Another user's photo, which the reference check would look up only by
      // its own stored spelling.
      const victim = storedImage('victim.jpg');
      vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(
        entry(`${prefix}victim.jpg`)
      );

      await exerciseService.deleteExerciseEntry('user-1', 'entry-1');

      expect(onDisk(victim)).toBe(true);
    }
  );

  it('deletes its unused image from the configured uploads directory', async () => {
    const image = storedImage('own.jpg');
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(
      entry(image)
    );

    await exerciseService.deleteExerciseEntry('user-1', 'entry-1');

    expect(onDisk(image)).toBe(false);
  });

  it('keeps an image another entry or preset still points at', async () => {
    const image = storedImage('shared.jpg');
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(
      entry(image)
    );
    vi.mocked(exerciseEntryDb.isExerciseImageReferenced).mockResolvedValue(
      true
    );

    await exerciseService.deleteExerciseEntry('user-1', 'entry-1');

    expect(exerciseEntryDb.isExerciseImageReferenced).toHaveBeenCalledWith(
      image
    );
    expect(onDisk(image)).toBe(true);
  });

  it('keeps the image when the entry could not be deleted', async () => {
    const image = storedImage('kept.jpg');
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(
      entry(image)
    );
    vi.mocked(exerciseEntryDb.deleteExerciseEntry).mockResolvedValue(false);

    await expect(
      exerciseService.deleteExerciseEntry('user-1', 'entry-1')
    ).rejects.toThrow();

    expect(onDisk(image)).toBe(true);
  });
});

describe('replacing an exercise entry image', () => {
  it('deletes the replaced image once the update is saved', async () => {
    const oldImage = storedImage('old.jpg');
    const newImage = storedImage('new.jpg');
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(
      entry(oldImage)
    );
    updateWithLockedRow(entry(oldImage));

    await exerciseService.updateExerciseEntry('user-1', 'user-1', 'entry-1', {
      image_url: newImage,
    });

    expect(onDisk(oldImage)).toBe(false);
    expect(onDisk(newImage)).toBe(true);
  });

  it('keeps the image when the update fails', async () => {
    const oldImage = storedImage('still-used.jpg');
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(
      entry(oldImage)
    );
    vi.mocked(exerciseEntryDb.updateExerciseEntry).mockRejectedValue(
      new Error('Exercise not found.')
    );

    await expect(
      exerciseService.updateExerciseEntry('user-1', 'user-1', 'entry-1', {
        image_url: null,
      })
    ).rejects.toThrow();

    expect(onDisk(oldImage)).toBe(true);
  });

  it('keeps the image when the same image is sent again', async () => {
    const image = storedImage('same.jpg');
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(
      entry(image)
    );
    updateWithLockedRow(entry(image));

    await exerciseService.updateExerciseEntry('user-1', 'user-1', 'entry-1', {
      image_url: image,
    });

    expect(onDisk(image)).toBe(true);
  });

  it('deletes the image the entry held under the lock', async () => {
    // Another edit replaced the image between the first read and the lock.
    const readFirst = storedImage('read-first.jpg');
    const heldUnderLock = storedImage('held-under-lock.jpg');
    vi.mocked(exerciseEntryDb.getExerciseEntryById).mockResolvedValue(
      entry(readFirst)
    );
    updateWithLockedRow(entry(heldUnderLock));

    await exerciseService.updateExerciseEntry('user-1', 'user-1', 'entry-1', {
      image_url: null,
    });

    expect(onDisk(heldUnderLock)).toBe(false);
    expect(onDisk(readFirst)).toBe(true);
  });
});
