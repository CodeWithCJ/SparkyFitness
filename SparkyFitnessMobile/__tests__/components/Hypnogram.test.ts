import { buildHypnogramSegments } from '../../src/components/Hypnogram';
import { buildStageEvent } from '../helpers/sleepFixtures';

const BOUNDS = { width: 300 };

/** Four contiguous 30-minute stages spanning 23:00 → 01:00. */
const contiguousStages = () => [
  buildStageEvent({
    id: 's1',
    stage_type: 'light',
    start_time: '2026-08-22T23:00:00+00:00',
    end_time: '2026-08-22T23:30:00+00:00',
  }),
  buildStageEvent({
    id: 's2',
    stage_type: 'deep',
    start_time: '2026-08-22T23:30:00+00:00',
    end_time: '2026-08-23T00:00:00+00:00',
  }),
  buildStageEvent({
    id: 's3',
    stage_type: 'rem',
    start_time: '2026-08-23T00:00:00+00:00',
    end_time: '2026-08-23T00:30:00+00:00',
  }),
  buildStageEvent({
    id: 's4',
    stage_type: 'awake',
    start_time: '2026-08-23T00:30:00+00:00',
    end_time: '2026-08-23T01:00:00+00:00',
  }),
];

describe('buildHypnogramSegments', () => {
  test('lays four contiguous stages out proportionally across the bounds', () => {
    const segments = buildHypnogramSegments(contiguousStages(), BOUNDS);

    expect(segments).toHaveLength(4);
    const totalWidth = segments.reduce(
      (sum, segment) => sum + segment.width,
      0
    );
    expect(totalWidth).toBeCloseTo(BOUNDS.width, 5);
    expect(segments.map((segment) => segment.lane)).toEqual([
      'light',
      'deep',
      'rem',
      'awake',
    ]);
  });

  test('sorts out-of-order events before laying them out', () => {
    const [first, second, third, fourth] = contiguousStages();
    const shuffled = [third, first, fourth, second];

    const segments = buildHypnogramSegments(shuffled, BOUNDS);

    expect(segments.map((segment) => segment.lane)).toEqual([
      'light',
      'deep',
      'rem',
      'awake',
    ]);
    for (let index = 1; index < segments.length; index++) {
      expect(segments[index].x).toBeGreaterThan(segments[index - 1].x);
    }
  });

  test('clamps a zero-length stage instead of emitting a zero or NaN width', () => {
    const stages = [
      ...contiguousStages(),
      buildStageEvent({
        id: 'zero',
        stage_type: 'rem',
        start_time: '2026-08-23T00:15:00+00:00',
        end_time: '2026-08-23T00:15:00+00:00',
      }),
    ];

    const segments = buildHypnogramSegments(stages, BOUNDS);

    for (const segment of segments) {
      expect(Number.isNaN(segment.width)).toBe(false);
      expect(segment.width).toBeGreaterThan(0);
    }
  });

  test('keeps overlapping stages positive-width and preserves the overall span', () => {
    const stages = [
      buildStageEvent({
        id: 'a',
        stage_type: 'light',
        start_time: '2026-08-22T23:00:00+00:00',
        end_time: '2026-08-23T00:00:00+00:00',
      }),
      buildStageEvent({
        id: 'b',
        stage_type: 'deep',
        start_time: '2026-08-22T23:30:00+00:00',
        end_time: '2026-08-23T00:30:00+00:00',
      }),
    ];

    const segments = buildHypnogramSegments(stages, BOUNDS);

    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(segment.width).toBeGreaterThan(0);
      expect(Number.isNaN(segment.x)).toBe(false);
    }
    // Span runs min(start) → max(end): the first starts at 0 and the last ends at width.
    expect(segments[0].x).toBeCloseTo(0, 5);
    const last = segments[segments.length - 1];
    expect(last.x + last.width).toBeCloseTo(BOUNDS.width, 5);
  });

  test('maps an unrecognized stage_type to the explicit fallback lane', () => {
    const stages = [
      buildStageEvent({
        id: 'unknown',
        stage_type: 'in_bed',
        start_time: '2026-08-22T23:00:00+00:00',
        end_time: '2026-08-23T00:00:00+00:00',
      }),
    ];

    expect(() => buildHypnogramSegments(stages, BOUNDS)).not.toThrow();
    const segments = buildHypnogramSegments(stages, BOUNDS);

    expect(segments).toHaveLength(1);
    expect(segments[0].lane).toBe('other');
    // The raw value is preserved so the renderer can still label it.
    expect(segments[0].stageType).toBe('in_bed');
  });

  test('returns [] for an empty array, driving the screen’s empty state', () => {
    expect(buildHypnogramSegments([], BOUNDS)).toEqual([]);
  });

  test('a single stage spanning the window fills the full width', () => {
    const stages = [
      buildStageEvent({
        id: 'only',
        stage_type: 'deep',
        start_time: '2026-08-22T23:00:00+00:00',
        end_time: '2026-08-23T06:00:00+00:00',
      }),
    ];

    const segments = buildHypnogramSegments(stages, BOUNDS);

    expect(segments).toHaveLength(1);
    expect(segments[0].x).toBeCloseTo(0, 5);
    expect(segments[0].width).toBeCloseTo(BOUNDS.width, 5);
  });

  test('parses +00:00 and Z offsets identically', () => {
    const withOffset = contiguousStages();
    const withZulu = withOffset.map((stage) => ({
      ...stage,
      start_time: stage.start_time.replace('+00:00', 'Z'),
      end_time: stage.end_time.replace('+00:00', 'Z'),
    }));

    expect(buildHypnogramSegments(withZulu, BOUNDS)).toEqual(
      buildHypnogramSegments(withOffset, BOUNDS)
    );
  });
});
