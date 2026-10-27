import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/genericHealthRepository.js', () => ({
  getHealthMetricSamples: vi.fn(),
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: { getExerciseEntryNames: vi.fn() },
}));
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

import * as genericHealthRepo from '../models/genericHealthRepository.js';
import exerciseEntryDb from '../models/exerciseEntry.js';
import { buildHeartRateSamplesTools } from '../ai/tools/heartRateSamplesTools.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

const opts = toolOpts;

const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const getSamples = genericHealthRepo.getHealthMetricSamples as ReturnType<
  typeof vi.fn
>;
const getNames = exerciseEntryDb.getExerciseEntryNames as ReturnType<
  typeof vi.fn
>;

function getTool() {
  return buildHeartRateSamplesTools('user-1', 'Europe/Lisbon')
    .sparky_get_heart_rate_samples;
}

const row = (entry_date: string, samples: unknown[]) => ({
  entry_date,
  samples,
});

describe('sparky_get_heart_rate_samples (#2950)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNames.mockResolvedValue(new Map([['entry-run', 'Running']]));
  });

  it('groups samples per workout and buckets them in local time', async () => {
    getSamples.mockResolvedValue([
      row('2026-10-25', [
        { t: '2026-10-25T11:47:40Z', bpm: 130, ex: 'entry-run' },
        { t: '2026-10-25T11:47:10Z', bpm: 120, ex: 'entry-run' },
        { t: '2026-10-25T11:48:05Z', bpm: 140, ex: 'entry-run' },
        { t: '2026-10-25T09:00:00Z', bpm: 60 },
      ]),
    ]);

    const result = await getTool().execute!({ start_date: '2026-10-25' }, opts);

    expect(getSamples).toHaveBeenCalledWith(
      'user-1',
      'user-1',
      'heart_rate',
      '2026-10-25',
      '2026-10-25'
    );
    expect(getNames).toHaveBeenCalledWith('user-1', ['entry-run']);
    expect(result).toBe(
      [
        '# Heart rate samples 2026-10-25 (Europe/Lisbon)',
        'Bucket: 1 min. Each line: local time, avg bpm (min-max).',
        '',
        '## 2026-10-25',
        '### Outside workouts: 09:00-09:00, 1 samples, avg 60, min 60, max 60',
        '09:00 60',
        '### Running [exercise entry entry-run]: 11:47-11:48, 3 samples, avg 130, min 120, max 140',
        '11:47 125 (120-130)',
        '11:48 140',
      ].join('\n')
    );
  });

  it('uses local time across a DST change (Lisbon was UTC+1 on 2026-10-24)', async () => {
    getSamples.mockResolvedValue([
      row('2026-10-24', [{ t: '2026-10-24T10:00:00Z', bpm: 70 }]),
    ]);

    const result = await getTool().execute!(
      { start_date: '2026-10-24', end_date: '2026-10-25' },
      opts
    );

    expect(result).toBe(
      [
        '# Heart rate samples 2026-10-24 to 2026-10-25 (Europe/Lisbon)',
        'No samples on: 2026-10-25',
        'Bucket: 1 min. Each line: local time, avg bpm (min-max).',
        '',
        '## 2026-10-24',
        '### Outside workouts: 11:00-11:00, 1 samples, avg 70, min 70, max 70',
        '11:00 70',
      ].join('\n')
    );
  });

  it('says so when there are no samples, without looking up workouts', async () => {
    getSamples.mockResolvedValue([]);

    const result = await getTool().execute!(
      { start_date: '2026-10-20', end_date: '2026-10-21' },
      opts
    );

    expect(result).toBe(
      '# Heart rate samples 2026-10-20 to 2026-10-21 (Europe/Lisbon)\nNo samples on: 2026-10-20, 2026-10-21'
    );
    expect(getNames).not.toHaveBeenCalled();
  });

  it('skips malformed samples', async () => {
    getSamples.mockResolvedValue([
      row('2026-10-25', [
        { t: 'not a time', bpm: 100 },
        { t: '2026-10-25T09:00:00Z', bpm: 'fast' },
        null,
        { t: '2026-10-25T09:01:00Z', bpm: 65 },
      ]),
    ]);

    const result = await getTool().execute!({ start_date: '2026-10-25' }, opts);

    expect(result).toContain(
      '### Outside workouts: 09:01-09:01, 1 samples, avg 65, min 65, max 65\n09:01 65'
    );
  });

  it('raises the bucket size until a long series fits', async () => {
    // One sample per minute for a whole day: too long at 1 or 2 minutes.
    const start = Date.parse('2026-10-25T00:00:00Z');
    const samples = Array.from({ length: 1440 }, (_, i) => ({
      t: new Date(start + i * 60_000).toISOString(),
      bpm: 60 + (i % 40),
    }));
    getSamples.mockResolvedValue([row('2026-10-25', samples)]);

    const result = (await getTool().execute!(
      { start_date: '2026-10-25' },
      opts
    )) as string;

    expect(result).toContain('Bucket: 5 min.');
    expect(result).toContain(
      '(Bucket raised from 1 to 5 min to fit the response. Ask for fewer days to get a finer series.)'
    );
    expect(result.length).toBeLessThanOrEqual(8_000);
  });

  it('refuses a range over 7 days or ending before it starts', async () => {
    const tooLong = await getTool().execute!(
      { start_date: '2026-10-01', end_date: '2026-10-08' },
      opts
    );
    expect(tooLong).toContain('The range is limited to 7 days.');

    const backwards = await getTool().execute!(
      { start_date: '2026-10-08', end_date: '2026-10-01' },
      opts
    );
    expect(backwards).toContain('end_date must be on or after start_date.');
    expect(getSamples).not.toHaveBeenCalled();
  });

  it('returns a DB error instead of throwing', async () => {
    getSamples.mockRejectedValue(new Error('db down'));

    const result = await getTool().execute!({ start_date: '2026-10-25' }, opts);

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
