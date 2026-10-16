import AsyncStorage from '@react-native-async-storage/async-storage';

import { getStride, learnStride } from '../../src/services/strideCalibration';
import { DEFAULT_STRIDE_METERS } from '../../src/utils/stride';

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
