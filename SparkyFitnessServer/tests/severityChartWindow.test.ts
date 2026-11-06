import { describe, expect, it } from 'vitest';
import { episodeImpactPoints, severityChartWindow } from '@workspace/shared';

const at = (time: string) => `2026-10-01T${time}:00.000Z`;
const ms = (time: string) => new Date(at(time)).getTime();

const ongoing = {
  started_at: at('09:00'),
  logged_at: at('09:00'),
  ended_at: null,
  severity: 5,
  severity_timeline: [{ at: at('09:00'), severity: 5 }],
};

describe('severityChartWindow', () => {
  it('returns null without a severity to draw', () => {
    expect(
      severityChartWindow({ ...ongoing, severity: null, severity_timeline: [] })
    ).toBeNull();
  });

  it('ends a running episode 30 minutes after a lone reading', () => {
    const frame = severityChartWindow(ongoing)!;
    expect(frame.end).toBe(ms('09:30'));
    expect(frame.span).toBe(30 * 60_000);
  });

  it('ends a running episode at its latest reading', () => {
    const frame = severityChartWindow({
      ...ongoing,
      severity_timeline: [
        { at: at('09:00'), severity: 5 },
        { at: at('11:00'), severity: 3 },
      ],
    })!;
    expect(frame.end).toBe(ms('11:00'));
  });

  it('extends a running episode 30 minutes past its latest effect', () => {
    const frame = severityChartWindow({
      ...ongoing,
      impact: 'severe',
      impact_timeline: [
        { at: at('13:00'), impact: 'severe' },
        { at: at('09:00'), impact: 'moderate' },
      ],
    })!;
    expect(frame.end).toBe(ms('13:30'));
    expect(frame.impact).toEqual([
      {
        at: at('09:00'),
        impact: 'moderate',
        from: ms('09:00'),
        to: ms('13:00'),
      },
      { at: at('13:00'), impact: 'severe', from: ms('13:00'), to: ms('13:30') },
    ]);
  });

  it('clamps an effect recorded after the end to the end', () => {
    const frame = severityChartWindow({
      ...ongoing,
      ended_at: at('12:00'),
      impact: 'mild',
      impact_timeline: [
        { at: at('09:00'), impact: 'severe' },
        { at: at('15:00'), impact: 'mild' },
      ],
    })!;
    expect(frame.end).toBe(ms('12:00'));
    expect(frame.impact).toEqual([
      { at: at('09:00'), impact: 'severe', from: ms('09:00'), to: ms('12:00') },
      { at: at('15:00'), impact: 'mild', from: ms('12:00'), to: ms('12:00') },
    ]);
  });

  it('shows the current effect from the start without a timeline', () => {
    const frame = severityChartWindow({ ...ongoing, impact: 'moderate' })!;
    expect(frame.impact).toEqual([
      {
        at: at('09:00'),
        impact: 'moderate',
        from: ms('09:00'),
        to: ms('09:30'),
      },
    ]);
  });
});

describe('episodeImpactPoints', () => {
  it('sorts the timeline by time', () => {
    expect(
      episodeImpactPoints({
        ...ongoing,
        impact: 'mild',
        impact_timeline: [
          { at: at('12:00'), impact: 'mild' },
          { at: at('09:00'), impact: 'moderate' },
        ],
      })
    ).toEqual([
      { at: at('09:00'), impact: 'moderate' },
      { at: at('12:00'), impact: 'mild' },
    ]);
  });

  it('counts the current impact from the start without a timeline', () => {
    expect(episodeImpactPoints({ ...ongoing, impact: 'severe' })).toEqual([
      { at: at('09:00'), impact: 'severe' },
    ]);
  });

  it('falls back to logged_at when the entry has no start', () => {
    expect(
      episodeImpactPoints({
        logged_at: at('10:00'),
        started_at: null,
        impact: 'mild',
      })
    ).toEqual([{ at: at('10:00'), impact: 'mild' }]);
  });

  it('is empty when no impact was recorded', () => {
    expect(
      episodeImpactPoints({ ...ongoing, impact: null, impact_timeline: [] })
    ).toEqual([]);
  });

  it('keeps a time Date cannot parse instead of breaking the sort', () => {
    // PostgreSQL accepts forms such as 20260625 that Date cannot parse.
    expect(
      episodeImpactPoints({
        ...ongoing,
        impact: 'severe',
        impact_timeline: [
          { at: '20260625', impact: 'moderate' },
          { at: at('10:00'), impact: 'severe' },
        ],
      })
    ).toEqual([
      { at: '20260625', impact: 'moderate' },
      { at: at('10:00'), impact: 'severe' },
    ]);
  });

  it('gives the chart band the same points, in the same order', () => {
    const entry = {
      ...ongoing,
      impact: 'mild' as const,
      impact_timeline: [
        { at: '2026-10-01T13:00:00+00:00', impact: 'mild' as const },
        { at: at('09:00'), impact: 'moderate' as const },
        { at: at('11:00'), impact: 'severe' as const },
      ],
    };
    expect(
      severityChartWindow(entry)!.impact.map(({ at, impact }) => ({
        at,
        impact,
      }))
    ).toEqual(episodeImpactPoints(entry));
  });
});
