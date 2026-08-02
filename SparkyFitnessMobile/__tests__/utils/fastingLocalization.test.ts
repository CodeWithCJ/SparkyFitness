import { FASTING_PRESETS, METABOLIC_STAGES } from '../../src/constants/fasting';
import {
  formatLocalizedFastingDuration,
  formatLocalizedLastFast,
  getFastingPresetDescription,
  getFastingPresetDisplayName,
  getFastingStageName,
  getLocalizedProtocolBadge,
} from '../../src/utils/fastingLocalization';
import type { FastingLog } from '../../src/types/fasting';

const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key}:${JSON.stringify(options)}` : key;

function buildLog(overrides: Partial<FastingLog> = {}): FastingLog {
  return {
    id: 'fast-1', user_id: 'user-1', start_time: new Date().toISOString(), end_time: null,
    target_end_time: null, duration_minutes: 60, fasting_type: '16:8 Leangains', status: 'COMPLETED',
    created_at: null, updated_at: null, ...overrides,
  };
}

describe('fasting localization helper', () => {
  it('maps all known preset names and descriptions with static keys', () => {
    expect(FASTING_PRESETS.map((preset) => getFastingPresetDisplayName(t, preset))).toEqual([
      'fasting.protocols.sixteenEight.name', 'fasting.protocols.eighteenSix.name',
      'fasting.protocols.twentyFour.name', 'fasting.protocols.circadian.name', 'fasting.protocols.custom.name',
    ]);
    expect(FASTING_PRESETS.map((preset) => getFastingPresetDescription(t, preset))).toEqual([
      'fasting.protocols.sixteenEight.description', 'fasting.protocols.eighteenSix.description',
      'fasting.protocols.twentyFour.description', 'fasting.protocols.circadian.description', 'fasting.protocols.custom.description',
    ]);
    expect(getFastingPresetDisplayName(t, { ...FASTING_PRESETS[0], id: 'server', name: 'Server Preset' })).toBe('Server Preset');
    expect(getFastingPresetDescription(t, { ...FASTING_PRESETS[0], id: 'server', description: 'Server description' })).toBe('Server description');
  });

  it('maps all known stages and preserves unknown server stages', () => {
    expect(METABOLIC_STAGES.map((stage) => getFastingStageName(t, stage))).toEqual([
      'fasting.stages.anabolic', 'fasting.stages.catabolic', 'fasting.stages.fatBurning',
      'fasting.stages.ketosis', 'fasting.stages.deepKetosis',
    ]);
    expect(getFastingStageName(t, { ...METABOLIC_STAGES[0], key: 'server', name: 'Server stage' })).toBe('Server stage');
  });

  it('localizes known badges and preserves ratios, empty values, and server text', () => {
    expect(getLocalizedProtocolBadge(t, '16:8 Leangains')).toBe('16:8');
    expect(getLocalizedProtocolBadge(t, 'Circadian Rhythm')).toBe('fasting.protocol.badgeCircadian');
    expect(getLocalizedProtocolBadge(t, 'Custom Fast')).toBe('fasting.protocol.badgeCustom');
    expect(getLocalizedProtocolBadge(t, null)).toBe('fasting.protocol.badgeFasting');
    expect(getLocalizedProtocolBadge(t, '')).toBe('fasting.protocol.badgeFasting');
    expect(getLocalizedProtocolBadge(t, 'Server Special')).toBe('Server Special');
  });

  it('formats localized durations for all required ranges', () => {
    expect(formatLocalizedFastingDuration(t, 0)).toContain('fasting.duration.minutes');
    expect(formatLocalizedFastingDuration(t, 47 * 60000)).toContain('fasting.duration.minutes');
    expect(formatLocalizedFastingDuration(t, 107 * 60000)).toContain('fasting.duration.hoursMinutes');
    expect(formatLocalizedFastingDuration(t, 964 * 60000)).toContain('fasting.duration.hoursMinutes');
  });

  it('formats null-duration logs as null and date variants with static keys', () => {
    expect(formatLocalizedLastFast(t, null)).toBeNull();
    expect(formatLocalizedLastFast(t, buildLog({ duration_minutes: null }))).toBeNull();
    expect(formatLocalizedLastFast(t, buildLog({ end_time: new Date().toISOString() }))).toContain('fasting.card.lastFastToday');
    expect(formatLocalizedLastFast(t, buildLog({ end_time: new Date(Date.now() - 86400000).toISOString() }))).toContain('fasting.card.lastFastYesterday');
    expect(formatLocalizedLastFast(t, buildLog({ end_time: '2026-01-06T12:00:00.000Z' }))).toContain('fasting.card.lastFastDate');
  });
});
