import { localizeProtocolBadge } from '../../src/utils/fastingLocalization';

describe('localizeProtocolBadge', () => {
  const en = ((key: string, options: { defaultValue: string }) => options.defaultValue);
  const pl = ((key: string, options: { defaultValue: string }) => {
    const values: Record<string, string> = {
      'fastingDetail.title': 'Post',
      'fastingProtocol.presets.circadian.name': 'Rytm dobowy',
      'fastingProtocol.presets.custom.name': 'Własny post',
    };
    return values[key] ?? options.defaultValue;
  });

  it.each([
    ['16:8 Leangains', '16:8'],
    ['18:6 Warrior', '18:6'],
    ['20:4 Warrior', '20:4'],
    ['  16 : 8 protocol ', '16:8'],
  ])('preserves compact ratios from application presets: %s → %s', (input, expected) => {
    expect(localizeProtocolBadge(en as never, input)).toBe(expected);
  });

  it('localizes known non-ratio presets', () => {
    expect(localizeProtocolBadge(pl as never, 'Circadian Rhythm')).toBe('Rytm dobowy');
    expect(localizeProtocolBadge(pl as never, 'Custom Fast')).toBe('Własny post');
  });

  it('keeps arbitrary server or user-created protocol names literal', () => {
    expect(localizeProtocolBadge(pl as never, 'Mój post 14 godzin')).toBe('Mój post 14 godzin');
  });

  it('uses the localized fasting title for empty values', () => {
    expect(localizeProtocolBadge(pl as never, null)).toBe('Post');
    expect(localizeProtocolBadge(pl as never, '   ')).toBe('Post');
  });
});
