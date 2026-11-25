import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// The diary-reference check: no row holds the path unless a test says so.
const diaryRows = vi.fn((): unknown[] => []);
vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(async () => ({
    query: vi.fn(async () => ({ rows: diaryRows() })),
    release: vi.fn(),
  })),
}));

// Point uploads at a scratch dir before the module reads the env at import.
const TMP_UPLOADS = path.join(
  os.tmpdir(),
  `sparky-orphans-test-${process.pid}`
);
const priorUploadsDir = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY;
process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = TMP_UPLOADS;

const { removeOrphanedImages } = await import('../middleware/imageUpload.js');

if (priorUploadsDir === undefined) {
  delete process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY;
} else {
  process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = priorUploadsDir;
}

afterAll(async () => {
  await fsp.rm(TMP_UPLOADS, { recursive: true, force: true });
});

beforeEach(() => {
  diaryRows.mockReset();
  diaryRows.mockReturnValue([]);
});

/** Writes a file under the uploads root and returns its stored web path. */
async function upload(relative: string): Promise<string> {
  const absolute = path.join(TMP_UPLOADS, relative);
  await fsp.mkdir(path.dirname(absolute), { recursive: true });
  await fsp.writeFile(absolute, 'img');
  return `/uploads/${relative}`;
}

const exists = (webPath: string) =>
  fs.existsSync(path.join(TMP_UPLOADS, webPath.slice('/uploads/'.length)));

describe('removeOrphanedImages', () => {
  it("deletes a dropped image from the edited row's own folder", async () => {
    const own = await upload('foods/food-a/own.jpg');

    await removeOrphanedImages([own], [], {
      domain: 'foods',
      entityId: 'food-a',
    });

    expect(exists(own)).toBe(false);
  });

  it("never deletes another user's check-in photo named in the image list", async () => {
    // The list is client JSON: a food can be saved with any path in it.
    const victim = await upload('check-in/victim-user/2026-11-20/front.jpg');

    await removeOrphanedImages([victim], [], {
      domain: 'foods',
      entityId: 'attacker-food',
    });

    expect(exists(victim)).toBe(true);
  });

  it("never deletes a file in another row's folder of the same kind", async () => {
    const other = await upload('foods/someone-elses-food/pic.jpg');

    await removeOrphanedImages([other], [], {
      domain: 'foods',
      entityId: 'food-a',
    });

    expect(exists(other)).toBe(true);
  });

  it('ignores nested, dotted and remote paths', async () => {
    const nested = await upload('foods/food-a/sub/pic.jpg');

    await removeOrphanedImages(
      [
        nested,
        '/uploads/foods/food-a/../../check-in/x/front.jpg',
        '/uploads/foods/food-a/.hidden',
        'https://cdn.example.com/a.jpg',
      ],
      [],
      { domain: 'foods', entityId: 'food-a' }
    );

    expect(exists(nested)).toBe(true);
  });

  it('keeps a file a diary row still references', async () => {
    const shared = await upload('food_entries/entry-1/kept.jpg');
    diaryRows.mockReturnValue([{ '?column?': 1 }]);

    await removeOrphanedImages([shared], [], {
      domain: 'food_entries',
      entityId: 'entry-1',
    });

    expect(exists(shared)).toBe(true);
  });

  it('accepts several owners and cleans only their folders', async () => {
    const e1 = await upload('food_entries/e1/a.jpg');
    const e2 = await upload('food_entries/e2/b.jpg');
    const e3 = await upload('food_entries/e3/c.jpg');

    await removeOrphanedImages(
      [e1, e2, e3],
      [],
      [
        { domain: 'food_entries', entityId: 'e1' },
        { domain: 'food_entries', entityId: 'e2' },
      ]
    );

    expect(exists(e1)).toBe(false);
    expect(exists(e2)).toBe(false);
    expect(exists(e3)).toBe(true);
  });
});
