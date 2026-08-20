import { localizeFastingStage, localizeProtocolBadge } from '../../src/utils/fastingLocalization';

describe('localizeProtocolBadge', () => {
  const en = ((key: string, options: { defaultValue: string; start?: number; end?: number; unit?: string }) =>
    options.defaultValue
      .replace('{{start}}', String(options.start ?? ''))
      .replace('{{end}}', String(options.end ?? ''))
      .replace('{{unit}}', options.unit ?? ''));
  const pl = ((key: string, options: { defaultValue: string; start?: number; end?: number; unit?: string }) => {
    const values: Record<string, string> = {
      'fastingDetail.title': 'Post',
      'fastingProtocol.presets.circadian.name': 'Rytm dobowy',
      'fastingProtocol.presets.custom.name': 'Własny post',
      'fastingDetail.range': '{{start}}–{{end}}{{unit}}',
      'fastingDetail.rangeOpen': '{{start}}{{unit}}+',
      'time.hoursShort': 'godz.',
    };
    return (values[key] ?? options.defaultValue)
      .replace('{{start}}', String(options.start ?? ''))
      .replace('{{end}}', String(options.end ?? ''))
      .replace('{{unit}}', options.unit ?? '');
  });

  it.each([
    ['16:8', '16:8'],
    ['18 : 6', '18:6'],
  ])('preserves compact ratios from application presets: %s → %s', (input, expected) => {
    expect(localizeProtocolBadge(en as never, input)).toBe(expected);
  });

  it('localizes known non-ratio presets', () => {
    expect(localizeProtocolBadge(pl as never, 'Circadian Rhythm')).toBe('Rytm dobowy');
    expect(localizeProtocolBadge(pl as never, 'Custom Fast')).toBe('Własny post');
  });

  it('keeps arbitrary server or user-created protocol names literal', () => {
    expect(localizeProtocolBadge(pl as never, 'Mój post 14 godzin')).toBe('Mój post 14 godzin');
    expect(localizeProtocolBadge(pl as never, 'Custom 16:8 plan')).toBe('Custom 16:8 plan');
    expect(localizeProtocolBadge(pl as never, '16:8 Leangains')).toBe('16:8 Leangains');
  });

  it('uses the localized fasting title for empty values', () => {
    expect(localizeProtocolBadge(pl as never, null)).toBe('Post');
    expect(localizeProtocolBadge(pl as never, '   ')).toBe('Post');
  });


  it('localizes metabolic-stage range units', () => {
    const stage = {
      key: 'catabolic',
      name: 'Catabolic',
      description: 'Glycogen depleting · fat metabolism ramping up',
      minHours: 4,
      maxHours: 16,
      rangeLabel: '4–16h',
    };
    expect(localizeFastingStage(en as never, stage).rangeLabel).toBe('4–16h');
    expect(localizeFastingStage(pl as never, stage).rangeLabel).toBe('4–16godz.');

    const finalStage = {
      key: 'deep-ketosis',
      name: 'Deep ketosis',
      description: 'Autophagy peak',
      minHours: 72,
      maxHours: null,
      rangeLabel: '72h+',
    };
    expect(localizeFastingStage(pl as never, finalStage).rangeLabel).toBe('72godz.+');
  });
});
