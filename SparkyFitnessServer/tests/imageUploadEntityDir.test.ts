import { afterAll, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../db/poolManager.js', () => ({ getSystemClient: vi.fn() }));

// Point uploads at a scratch dir before the module reads the env at import.
const TMP_UPLOADS = path.join(os.tmpdir(), `sparky-imgup-test-${process.pid}`);
const priorUploadsDir = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY;
process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = TMP_UPLOADS;

const { finalizeUploadedImages, removeEntityImageDir } =
  await import('../middleware/imageUpload.js');
const { isSafePathSegment } = await import('../utils/uploadsPath.js');

if (priorUploadsDir === undefined) {
  delete process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY;
} else {
  process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = priorUploadsDir;
}

afterAll(async () => {
  await fsp.rm(TMP_UPLOADS, { recursive: true, force: true });
});

async function stagedFile(name: string) {
  const dir = path.join(TMP_UPLOADS, '_staging', 'req-1');
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await fsp.writeFile(filePath, 'img');
  return { filename: name, path: filePath };
}

describe('isSafePathSegment', () => {
  it('accepts plain names and ids', () => {
    for (const ok of [
      '3_4_Sit-Up',
      'Air_Bike',
      '0.jpg',
      'a1b2c3d4-0000-4000-8000-000000000000',
    ]) {
      expect(isSafePathSegment(ok)).toBe(true);
    }
  });

  it('refuses separators, dot segments and odd values', () => {
    for (const bad of [
      '..',
      '.',
      '../x',
      'a/b',
      'a\\b',
      '.hidden',
      '',
      'x'.repeat(256),
      ['a'],
      undefined,
    ]) {
      expect(isSafePathSegment(bad)).toBe(false);
    }
  });
});

describe('finalizeUploadedImages', () => {
  it('moves files into the entity folder for a plain id', async () => {
    const file = await stagedFile('ok.png');

    const paths = await finalizeUploadedImages([file], 'foods', 'food-1');

    expect(paths).toEqual(['/uploads/foods/food-1/ok.png']);
    expect(
      fs.existsSync(path.join(TMP_UPLOADS, 'foods', 'food-1', 'ok.png'))
    ).toBe(true);
  });

  it('refuses an id that would move files outside the uploads folder', async () => {
    const file = await stagedFile('evil.png');

    await expect(
      finalizeUploadedImages([file], 'foods', '../../escaped')
    ).rejects.toMatchObject({ name: 'ValidationError' });
    expect(fs.existsSync(path.join(TMP_UPLOADS, '..', 'escaped'))).toBe(false);
    // The staged file is left where it was for the normal cleanup.
    expect(fs.existsSync(file.path)).toBe(true);
  });

  it('does nothing when removing the folder of an unsafe id', async () => {
    await expect(
      removeEntityImageDir('foods', '../..')
    ).resolves.toBeUndefined();
    expect(fs.existsSync(TMP_UPLOADS)).toBe(true);
  });
});
