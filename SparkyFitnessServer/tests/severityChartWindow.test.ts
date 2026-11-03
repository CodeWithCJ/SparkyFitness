import { describe, expect, it } from 'vitest';
import { severityChartWindow } from '@workspace/shared';

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
