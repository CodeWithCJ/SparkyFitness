import { describe, expect, it } from 'vitest';
import {
  computeTrainingLoad,
  estimateMaxHeartRate,
  sessionLoad,
} from '@workspace/shared';

const TODAY = '2026-10-13';
const run = (day: string, minutes: number, hr: number | null = null) => ({
  day,
  durationMinutes: minutes,
  avgHeartRate: hr,
});

describe('estimateMaxHeartRate', () => {
  it('uses 220 minus age, with a default for none or nonsense', () => {
    expect(estimateMaxHeartRate(40)).toBe(180);
    expect(estimateMaxHeartRate(null)).toBe(190);
    expect(estimateMaxHeartRate(3)).toBe(190);
    expect(estimateMaxHeartRate(95)).toBe(150);
  });
});

describe('sessionLoad', () => {
  it('weights minutes by how hard the heart worked', () => {
    expect(sessionLoad({ durationMinutes: 30, avgHeartRate: 100 }, 190)).toBe(
      30
    );
    expect(sessionLoad({ durationMinutes: 30, avgHeartRate: 150 }, 190)).toBe(
      90
    );
    expect(sessionLoad({ durationMinutes: 30, avgHeartRate: 185 }, 190)).toBe(
      150
    );
  });

  it('counts a session with no heart rate as moderate', () => {
    expect(sessionLoad({ durationMinutes: 30, avgHeartRate: null }, 190)).toBe(
      60
    );
  });

  it('caps a forgotten stop and ignores negative time', () => {
    expect(
      sessionLoad({ durationMinutes: 5000, avgHeartRate: null }, 190)
    ).toBe(1200);
    expect(sessionLoad({ durationMinutes: -5, avgHeartRate: null }, 190)).toBe(
      0
    );
  });
});

describe('computeTrainingLoad', () => {
  it('says there is no data without sessions', () => {
    const load = computeTrainingLoad([], TODAY);
    expect(load.status).toBe('noData');
    expect(load.ratio).toBeNull();
    expect(load.weeks).toHaveLength(4);
  });

  it('is still learning in the first three weeks', () => {
    const load = computeTrainingLoad([run('2026-10-08', 30)], TODAY);
    expect(load.status).toBe('learning');
  });

  it('calls an even month steady', () => {
    const sessions = [
      run('2026-09-20', 30),
      run('2026-09-27', 30),
      run('2026-10-04', 30),
      run('2026-10-11', 30),
    ];
    const load = computeTrainingLoad(sessions, TODAY);
    expect(load.weeks.map((w) => w.load)).toEqual([60, 60, 60, 60]);
    expect(load.ratio).toBe(1);
    expect(load.status).toBe('steady');
  });

  it('flags a spike and advises rest after back-to-back days', () => {
    const sessions = [
      run('2026-09-20', 30),
      run('2026-10-12', 90),
      run('2026-10-13', 90),
    ];
    const load = computeTrainingLoad(sessions, TODAY);
    expect(load.acute).toBe(360);
    expect(load.status).toBe('spike');
    expect(load.recovery).toBe('takeRest');
    expect(load.restDays).toBe(0);
  });

  it('calls a quiet week low and ready after a couple of rest days', () => {
    const sessions = [
      run('2026-09-16', 60),
      run('2026-09-23', 60),
      run('2026-09-30', 60),
      run('2026-10-05', 20),
    ];
    const load = computeTrainingLoad(sessions, TODAY);
    expect(load.status).toBe('low');
    expect(load.restDays).toBe(8);
    expect(load.recovery).toBe('ready');
  });

  it('ignores sessions outside the four weeks and in the future', () => {
    const load = computeTrainingLoad(
      [run('2026-08-01', 60), run('2026-10-20', 60)],
      TODAY
    );
    expect(load.status).toBe('noData');
  });
});
