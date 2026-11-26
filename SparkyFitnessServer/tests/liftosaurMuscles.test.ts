import { vi, beforeEach, describe, it, expect } from 'vitest';
import axios from 'axios';

vi.mock('axios');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/diagnosticLogger.js', () => ({ logRawResponse: vi.fn() }));

import {
  batchNames,
  buildProgramText,
  hasNoMuscles,
  invertProgramStats,
  resolveLiftosaurMuscles,
  toSparkyMuscle,
  type LiftosaurProgramStats,
} from '../integrations/liftosaur/liftosaurMuscles.js';

/** Trimmed from a live POST /api/v1/program-stats response. */
const LIVE_STATS: LiftosaurProgramStats = {
  data: {
    muscleGroups: [
      {
        muscle: 'biceps',
        exercises: [
          { name: 'Bicep Curl', isSynergist: false },
          { name: 'Lat Pulldown', isSynergist: true },
          { name: 'Seated Row', isSynergist: true },
        ],
      },
      {
        muscle: 'lats',
        exercises: [
          { name: 'Lat Pulldown', isSynergist: false },
          { name: 'Seated Row', isSynergist: false },
        ],
      },
      {
        muscle: 'upperBack',
        exercises: [
          { name: 'Seated Row', isSynergist: false },
          { name: 'Lateral Raise', isSynergist: true },
          { name: 'Lat Pulldown', isSynergist: true },
        ],
      },
      {
        muscle: 'sideDelts',
        exercises: [{ name: 'Lateral Raise', isSynergist: false }],
      },
      {
        muscle: 'frontDelts',
        exercises: [{ name: 'Lateral Raise', isSynergist: true }],
      },
      {
        muscle: 'rearDelts',
        exercises: [{ name: 'Lat Pulldown', isSynergist: true }],
      },
      {
        muscle: 'hamstrings',
        exercises: [{ name: 'Lying Leg Curl', isSynergist: false }],
      },
      {
        muscle: 'hipFlexors',
        exercises: [{ name: 'Lying Leg Curl', isSynergist: true }],
      },
      {
        muscle: 'calves',
        exercises: [{ name: 'Lying Leg Curl', isSynergist: true }],
      },
    ],
  },
};

function okResponse(data: unknown) {
  return { status: 200, data };
}

function unknownExerciseResponse(...names: string[]) {
  return {
    status: 422,
    data: {
      error: {
        code: 'parse_error',
        message: 'Failed to parse program',
        details: names.map((name) => ({
          type: 'unknownExercise',
          message: `${name}: Unknown exercise ${name}`,
          data: { name },
        })),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toSparkyMuscle', () => {
  it.each([
    ['frontDelts', 'shoulders'],
    ['sideDelts', 'shoulders'],
    ['rearDelts', 'shoulders'],
    ['rotatorCuff', 'shoulders'],
    ['upperTraps', 'traps'],
    ['upperBack', 'middle back'],
    ['lowerBack', 'lower back'],
    ['abs', 'abdominals'],
    ['obliques', 'abdominals'],
    ['forearmFlexors', 'forearms'],
    ['forearmExtensors', 'forearms'],
    ['quadriceps', 'quadriceps'],
    ['glutes', 'glutes'],
    ['adductors', 'adductors'],
    ['chest', 'chest'],
  ])('maps %s to %s', (key, expected) => {
    expect(toSparkyMuscle(key)).toBe(expected);
  });

  it('drops groups SparkyFitness has no muscle for', () => {
    expect(toSparkyMuscle('hipFlexors')).toBeNull();
    expect(toSparkyMuscle('somethingNew')).toBeNull();
  });
});

describe('buildProgramText', () => {
  it('writes a one-day Liftoscript program with one line per exercise', () => {
    expect(buildProgramText(['Squat', 'Bicep Curl, Cable'])).toBe(
      '# Week 1\n## Day 1\nSquat / 3x5 / 100lb\nBicep Curl, Cable / 3x5 / 100lb\n'
    );
  });
});

describe('batchNames', () => {
  it('never puts two names with the same bare name in one batch', () => {
    expect(
      batchNames([
        'Bicep Curl, Cable',
        'Squat',
        'Bicep Curl',
        'bicep curl, Dumbbell',
      ])
    ).toEqual([
      ['Bicep Curl, Cable', 'Squat'],
      ['Bicep Curl'],
      ['bicep curl, Dumbbell'],
    ]);
  });

  it('caps the batch size', () => {
    expect(batchNames(['A', 'B', 'C'], 2)).toEqual([['A', 'B'], ['C']]);
  });
});

describe('invertProgramStats', () => {
  it('turns muscle groups into target and synergist muscles per requested name', () => {
    const result = invertProgramStats(LIVE_STATS, [
      'Lat Pulldown',
      'Seated Row, Leverage Machine',
      'Lateral Raise',
      'Lying Leg Curl',
    ]);

    expect(result.get('Lat Pulldown')).toEqual({
      primary: ['lats'],
      secondary: ['biceps', 'middle back', 'shoulders'],
    });
    // The response drops the equipment suffix; it maps back to the request.
    expect(result.get('Seated Row, Leverage Machine')).toEqual({
      primary: ['lats', 'middle back'],
      secondary: ['biceps'],
    });
    // Side delts (target) and front delts (synergist) are both shoulders:
    // the muscle stays primary only.
    expect(result.get('Lateral Raise')).toEqual({
      primary: ['shoulders'],
      secondary: ['middle back'],
    });
    // Hip flexors have no SparkyFitness muscle and are dropped.
    expect(result.get('Lying Leg Curl')).toEqual({
      primary: ['hamstrings'],
      secondary: ['calves'],
    });
  });

  it('ignores exercises that were not requested', () => {
    const result = invertProgramStats(LIVE_STATS, ['Lat Pulldown']);
    expect([...result.keys()]).toEqual(['Lat Pulldown']);
  });
});

describe('resolveLiftosaurMuscles', () => {
  it('posts the program with the API key and returns muscles per name', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce(okResponse(LIVE_STATS));

    const result = await resolveLiftosaurMuscles('lftsk_test', [
      'Lat Pulldown',
      'Lat Pulldown',
    ]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = vi.mocked(axios.post).mock.calls[0]!;
    expect(url).toMatch(/\/api\/v1\/program-stats$/);
    expect(body).toEqual({
      programText: buildProgramText(['Lat Pulldown']),
    });
    expect(config?.headers).toEqual({ Authorization: 'Bearer lftsk_test' });
    expect(result.get('Lat Pulldown')?.primary).toEqual(['lats']);
  });

  it('drops exercises Liftosaur does not know and retries once', async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce(unknownExerciseResponse('My Custom Lift'))
      .mockResolvedValueOnce(okResponse(LIVE_STATS));

    const result = await resolveLiftosaurMuscles('lftsk_test', [
      'Lat Pulldown',
      'My Custom Lift, Barbell',
    ]);

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(vi.mocked(axios.post).mock.calls[1]![1]).toEqual({
      programText: buildProgramText(['Lat Pulldown']),
    });
    expect(result.has('Lat Pulldown')).toBe(true);
    expect(result.has('My Custom Lift, Barbell')).toBe(false);
  });

  it('gives up on a batch after one retry', async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce(unknownExerciseResponse('A'))
      .mockResolvedValueOnce(unknownExerciseResponse('B'));

    const result = await resolveLiftosaurMuscles('lftsk_test', ['A', 'B', 'C']);

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(0);
  });

  it('gives up on a 422 that names no unknown exercise', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      status: 422,
      data: { error: { code: 'parse_error', details: [{ type: 'syntax' }] } },
    });

    const result = await resolveLiftosaurMuscles('lftsk_test', ['Squat']);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(0);
  });

  it('returns nothing for a response of an unexpected shape', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce(
      okResponse({ data: { groups: [] } })
    );

    expect((await resolveLiftosaurMuscles('k', ['Squat'])).size).toBe(0);
  });

  it('never throws when a request fails, and keeps other batches', async () => {
    vi.mocked(axios.post)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(okResponse(LIVE_STATS));

    const result = await resolveLiftosaurMuscles(
      'k',
      Array.from({ length: 50 }, (_, i) => `Filler ${i}`).concat('Lat Pulldown')
    );

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(result.get('Lat Pulldown')?.primary).toEqual(['lats']);
  });

  it('skips names that cannot be written into a program line', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce(okResponse(LIVE_STATS));

    await resolveLiftosaurMuscles('k', ['Lat Pulldown', 'Push / Pull', '# x']);

    expect(vi.mocked(axios.post).mock.calls[0]![1]).toEqual({
      programText: buildProgramText(['Lat Pulldown']),
    });
  });

  it('makes no request when every name is unusable', async () => {
    await resolveLiftosaurMuscles('k', ['a/b']);
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('hasNoMuscles', () => {
  it.each([null, undefined, '', '[]', ' [ ] ', 'null', []])(
    'treats %j as empty',
    (value) => expect(hasNoMuscles(value)).toBe(true)
  );

  it.each(['["chest"]', ['chest']])('treats %j as set', (value) =>
    expect(hasNoMuscles(value)).toBe(false)
  );
});
