import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getStride,
  getStrideProfile,
  learnStride,
  resetStride,
  setStride,
} from '../../src/services/strideCalibration';
import { DEFAULT_STRIDE_METERS } from '../../src/utils/stride';

const KEY = '@SparkyFitness/strideCalibration';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('strideCalibration', () => {
  it('starts from a typical stride, marked as not learned', async () => {
    expect(await getStride('walk')).toEqual({
      meters: DEFAULT_STRIDE_METERS.walk,
      calibrated: false,
    });
    expect(await getStride('run')).toEqual({
      meters: DEFAULT_STRIDE_METERS.run,
      calibrated: false,
    });
  });

  it('learns from a known distance and keeps it', async () => {
    // 3 km in 3,750 steps: 0.8 m.
    expect(await learnStride('walk', 3750, 3000)).toBe(true);

    const stride = await getStride('walk');
    expect(stride.calibrated).toBe(true);
    expect(stride.meters).toBeCloseTo(0.8);
  });

  it('keeps walking and running apart', async () => {
    await learnStride('walk', 3750, 3000);

    expect((await getStride('run')).calibrated).toBe(false);
  });

  it('blends a second sample in', async () => {
    await learnStride('run', 3000, 3000); // 1.0 m
    await learnStride('run', 2500, 3000); // 1.2 m

    expect((await getStride('run')).meters).toBeCloseTo(1.1);
  });

  it('ignores a sample it cannot trust', async () => {
    expect(await learnStride('walk', 100, 80)).toBe(false);
    expect(await learnStride('walk', 200, 5000)).toBe(false);

    expect((await getStride('walk')).calibrated).toBe(false);
  });

  it('falls back to the default when what is stored is damaged', async () => {
    await AsyncStorage.setItem('@SparkyFitness/strideCalibration', '{not json');
    expect((await getStride('walk')).calibrated).toBe(false);

    await AsyncStorage.setItem(
      '@SparkyFitness/strideCalibration',
      JSON.stringify({ walk: { meters: 'far', samples: 1 } })
    );
    expect((await getStride('walk')).calibrated).toBe(false);
  });
});

describe('the stride profile', () => {
  it('shows the default with nothing behind it', async () => {
    const profile = await getStrideProfile();
    expect(profile.walk).toEqual({
      meters: DEFAULT_STRIDE_METERS.walk,
      calibrated: false,
      samples: 0,
      manual: false,
    });
  });

  it('counts the real distances that taught a stride', async () => {
    await learnStride('run', 3000, 3000);
    await learnStride('run', 3000, 3000);

    expect((await getStrideProfile()).run).toMatchObject({
      calibrated: true,
      samples: 2,
      manual: false,
    });
  });

  it('keeps a hand-set stride and marks it', async () => {
    expect(await setStride('walk', 0.7)).toBe(true);

    expect(await getStride('walk')).toEqual({ meters: 0.7, calibrated: true });
    expect((await getStrideProfile()).walk).toMatchObject({
      samples: 0,
      manual: true,
    });
    expect((await getStrideProfile()).run.calibrated).toBe(false);
  });

  it('refuses a stride no person has', async () => {
    expect(await setStride('walk', 0.1)).toBe(false);
    expect(await setStride('walk', 4)).toBe(false);
    expect((await getStride('walk')).calibrated).toBe(false);
  });

  it('learns on from a hand-set stride without jumping to the sample', async () => {
    await setStride('run', 1);
    await learnStride('run', 2500, 3500); // 1.4 m

    const profile = (await getStrideProfile()).run;
    expect(profile.meters).toBeCloseTo(1.1);
    expect(profile.manual).toBe(false);
    expect(profile.samples).toBe(1);
  });

  it('resets one activity to learn from scratch', async () => {
    await learnStride('walk', 3750, 3000);
    await learnStride('run', 3000, 3000);

    expect(await resetStride('walk')).toBe(true);

    expect((await getStrideProfile()).walk.calibrated).toBe(false);
    expect((await getStrideProfile()).run.calibrated).toBe(true);
  });
});

describe('one run counts once', () => {
  const stored = async () =>
    JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}').run;

  it('replaces the sample a run taught earlier instead of adding another', async () => {
    await learnStride('run', 1000, 1000, 'entry-1');
    expect((await stored()).samples).toBe(1);

    await learnStride('run', 1000, 900, 'entry-1');
    const after = await stored();
    expect(after.samples).toBe(1);
    expect(after.meters).toBeCloseTo(0.9, 5);
  });

  it('adds a sample for a different run', async () => {
    await learnStride('run', 1000, 1000, 'entry-1');
    await learnStride('run', 1000, 900, 'entry-2');
    expect((await stored()).samples).toBe(2);
  });

  it('counts every call that names no run', async () => {
    await learnStride('run', 1000, 1000);
    await learnStride('run', 1000, 1000);
    expect((await stored()).samples).toBe(2);
  });
});
