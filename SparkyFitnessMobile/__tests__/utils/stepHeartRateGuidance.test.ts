import type { IntervalStep } from '@workspace/shared';
import { stepHeartRateGuidance } from '../../src/utils/stepHeartRateGuidance';

const band = { minBpm: 111, maxBpm: 129 };
const zone2: IntervalStep = {
  kind: 'work',
  seconds: 3600,
  effort: 'zone2',
  heartRate: band,
};

describe('stepHeartRateGuidance', () => {
  test('is null for a step that asks nothing about heart rate', () => {
    expect(
      stepHeartRateGuidance({ kind: 'work', seconds: 60 }, 150, 10, true)
    ).toBeNull();
  });

  test('a Zone 2 step with no range is run by the talk test', () => {
    expect(
      stepHeartRateGuidance(
        { kind: 'work', seconds: 600, effort: 'zone2' },
        140,
        10,
        true
      )
    ).toEqual({ kind: 'talkTest', band: null });
  });

  test('says where a reading sits against the range', () => {
    expect(stepHeartRateGuidance(zone2, 120, 600, true)).toEqual({
      kind: 'inside',
      band,
      bpm: 120,
    });
    expect(stepHeartRateGuidance(zone2, 140, 600, true)).toMatchObject({
      kind: 'above',
    });
    expect(stepHeartRateGuidance(zone2, 100, 600, true)).toMatchObject({
      kind: 'below',
    });
  });

  test('waits for a reading when a watch is feeding them', () => {
    expect(stepHeartRateGuidance(zone2, null, 600, true)).toEqual({
      kind: 'waiting',
      band,
    });
  });

  test('with no watch, keeps the range on show and falls back to the talk test', () => {
    expect(stepHeartRateGuidance(zone2, null, 600, false)).toEqual({
      kind: 'talkTest',
      band,
    });
  });

  test('forgives low readings at the start and a little drift late in a long run', () => {
    expect(stepHeartRateGuidance(zone2, 105, 30, true)).toMatchObject({
      kind: 'inside',
    });
    expect(stepHeartRateGuidance(zone2, 105, 600, true)).toMatchObject({
      kind: 'below',
    });
    expect(stepHeartRateGuidance(zone2, 133, 3300, true)).toMatchObject({
      kind: 'inside',
    });
    expect(stepHeartRateGuidance(zone2, 133, 600, true)).toMatchObject({
      kind: 'above',
    });
  });

  test('another stretch with a range is judged against it as it is', () => {
    const fast: IntervalStep = {
      kind: 'work',
      seconds: 60,
      heartRate: { minBpm: 160, maxBpm: 175 },
    };
    expect(stepHeartRateGuidance(fast, 158, 3300, true)).toMatchObject({
      kind: 'below',
    });
  });
});
