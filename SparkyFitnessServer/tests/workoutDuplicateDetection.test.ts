import { describe, expect, it } from 'vitest';
import {
  classifyIncomingWorkout,
  completenessScore,
  overlapRatio,
  relativeDiff,
  type WorkoutSummary,
} from '../services/workoutDuplicateDetection.js';

// The real pair from #2839: one walk written to Health Connect by a watch app
// and by the phone, two minutes apart. A carries heart rate, B does not.
const walkA: WorkoutSummary = {
  id: 'entry-a',
  source: 'Health Connect',
  sourceId: 'f2069027-a',
  activity: 'Walking',
  startMs: Date.parse('2026-10-18T10:47:00Z'),
  durationMinutes: 86.1,
  distanceKm: 7.29,
  steps: 9522,
  completeness: completenessScore({
    avg_heart_rate: 107,
    max_heart_rate: 146,
    distance: 7.29,
    steps: 9522,
  }),
  isManual: false,
};
const walkB: WorkoutSummary = {
  id: 'entry-b',
  source: 'Health Connect',
  sourceId: '50cd4679-b',
  activity: 'Walking',
  startMs: Date.parse('2026-10-18T10:49:00Z'),
  durationMinutes: 84,
  distanceKm: 7.14,
  steps: 9294,
  completeness: completenessScore({ distance: 7.14, steps: 9294 }),
  isManual: false,
};
const incoming = (w: WorkoutSummary): WorkoutSummary => ({
  ...w,
  id: undefined,
});

describe('workout duplicate detection (#2839)', () => {
  it('measures the example pair as the same walk', () => {
    expect(overlapRatio(walkA, walkB)).toBeCloseTo(84 / 86.1, 3);
    expect(relativeDiff(7.29, 7.14)).toBeLessThan(0.05);
    expect(relativeDiff(9522, 9294)).toBeLessThan(0.05);
  });

  it('skips the example walk B when A, with heart rate, is already stored', () => {
    const decision = classifyIncomingWorkout(incoming(walkB), [walkA]);
    expect(decision.kind).toBe('keep-existing');
    expect(decision.kind !== 'none' && decision.existing.id).toBe('entry-a');
  });

  it('replaces a stored B when the more complete A arrives later', () => {
    const decision = classifyIncomingWorkout(incoming(walkA), [walkB]);
    expect(decision.kind).toBe('replace-existing');
    expect(decision.kind !== 'none' && decision.existing.id).toBe('entry-b');
  });

  it('keeps what is stored on a completeness tie, so order cannot flip the result', () => {
    const twin = {
      ...walkB,
      sourceId: 'other',
      completeness: walkA.completeness,
    };
    expect(classifyIncomingWorkout(incoming(twin), [walkA]).kind).toBe(
      'keep-existing'
    );
  });

  it('leaves two genuinely separate walks on the same day alone', () => {
    const evening: WorkoutSummary = {
      ...walkB,
      sourceId: 'evening-walk',
      startMs: Date.parse('2026-10-18T18:30:00Z'),
      durationMinutes: 85,
    };
    expect(classifyIncomingWorkout(incoming(evening), [walkA]).kind).toBe(
      'none'
    );
  });

  it('leaves a walk and a run that overlap alone', () => {
    const run: WorkoutSummary = {
      ...walkB,
      sourceId: 'run-1',
      activity: 'Running',
    };
    expect(classifyIncomingWorkout(incoming(run), [walkA]).kind).toBe('none');
  });

  it('treats a re-sync of the same record as an update, not a duplicate', () => {
    const decision = classifyIncomingWorkout(incoming(walkA), [walkA, walkB]);
    expect(decision.kind).toBe('resync');
    expect(decision.kind === 'resync' && decision.existing.id).toBe('entry-a');
  });

  it('never skips or replaces a manual entry, only reports the overlap', () => {
    const manual: WorkoutSummary = {
      ...walkA,
      id: 'manual-1',
      source: 'manual',
      sourceId: null,
      completeness: 0,
      isManual: true,
    };
    expect(classifyIncomingWorkout(incoming(walkA), [manual]).kind).toBe(
      'manual-overlap'
    );
  });

  it('needs at least 80% overlap of the longer workout', () => {
    const shifted = {
      ...walkB,
      startMs: (walkA.startMs as number) + 18 * 60_000, // 68 of 86 minutes shared
    };
    expect(overlapRatio(walkA, shifted)).toBeLessThan(0.8);
    expect(classifyIncomingWorkout(incoming(shifted), [walkA]).kind).toBe(
      'none'
    );
  });

  it('rejects a pair whose distance differs by more than 5%', () => {
    const farther = { ...walkB, distanceKm: 7.9 };
    expect(classifyIncomingWorkout(incoming(farther), [walkA]).kind).toBe(
      'none'
    );
  });

  it('ignores steps when only one copy has them', () => {
    const noSteps = { ...walkB, steps: null };
    expect(classifyIncomingWorkout(incoming(noSteps), [walkA]).kind).toBe(
      'keep-existing'
    );
  });

  it('does not match a record without a start time or without a source_id', () => {
    expect(
      classifyIncomingWorkout({ ...incoming(walkB), startMs: null }, [walkA])
        .kind
    ).toBe('none');
    expect(
      classifyIncomingWorkout({ ...incoming(walkB), sourceId: null }, [walkA])
        .kind
    ).toBe('none');
    expect(
      classifyIncomingWorkout(incoming(walkB), [{ ...walkA, startMs: null }])
        .kind
    ).toBe('none');
  });
});
