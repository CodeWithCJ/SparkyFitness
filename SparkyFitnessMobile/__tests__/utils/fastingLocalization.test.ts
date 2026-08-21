import i18n, { initializeI18n } from '../../src/localization/i18n';
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
      'fastingProtocol.presets.circadian.name': 'Post zgodny z rytmem dobowym',
      'fastingProtocol.presets.custom.name': 'Własny post',
      'fastingDetail.range': '{{start}}–{{end}} {{unit}}',
      'fastingDetail.rangeOpen': '{{start}} {{unit}}+',
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
    expect(localizeProtocolBadge(pl as never, 'Circadian Rhythm')).toBe('Post zgodny z rytmem dobowym');
    expect(localizeProtocolBadge(pl as never, 'Custom Fast')).toBe('Własny post');
  });

  it('keeps arbitrary server or user-created protocol names literal', () => {
    expect(localizeProtocolBadge(pl as never, 'Mój post 14 godzin')).toBe('Mój post 14 godzin');
    expect(localizeProtocolBadge(pl as never, 'Custom 16:8 plan')).toBe('Custom 16:8 plan');
  });

  it('keeps compact diary badges ratio-only for known controlled protocols', () => {
    expect(localizeProtocolBadge(pl as never, '16:8 Leangains')).toBe('16:8');
    expect(localizeProtocolBadge(pl as never, '18:6 Warrior')).toBe('18:6');
    expect(localizeProtocolBadge(pl as never, '20:4 Warrior')).toBe('20:4');
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
    expect(localizeFastingStage(en as never, stage).rangeLabel).toBe('4–16 h');
    expect(localizeFastingStage(pl as never, stage).rangeLabel).toBe('4–16 godz.');

    const finalStage = {
      key: 'deep-ketosis',
      name: 'Deep ketosis',
      description: 'Autophagy peak',
      minHours: 72,
      maxHours: null,
      rangeLabel: '72h+',
    };
    expect(localizeFastingStage(pl as never, finalStage).rangeLabel).toBe('72 godz.+');
  });
});

describe('fasting protocol picker catalog copy', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  const names = [
    ['leangains', '16:8 Leangains', 'Post 16:8 (Leangains)'],
    ['warrior18', '18:6 Warrior', 'Post 18:6 (Warrior)'],
    ['warrior20', '20:4 Warrior', 'Post 20:4 (Warrior)'],
    ['circadian', 'Circadian Rhythm', 'Post zgodny z rytmem dobowym'],
    ['custom', 'Custom Fast', 'Własny post'],
  ] as const;

  test.each(names)('keeps canonical EN and reviewed PL picker name for %s', async (key, enExpected, plExpected) => {
    await i18n.changeLanguage('en');
    expect(i18n.t(`fastingProtocol.presets.${key}.name`)).toBe(enExpected);
    await i18n.changeLanguage('pl');
    expect(i18n.t(`fastingProtocol.presets.${key}.name`)).toBe(plExpected);
  });

  test('uses reviewed Polish descriptions without changing EN semantics', async () => {
    await i18n.changeLanguage('pl');
    expect(i18n.t('fastingProtocol.presets.leangains.description')).toBe(
      'Pomiń śniadanie i jedz w 8-godzinnym oknie żywieniowym.',
    );
    expect(i18n.t('fastingProtocol.presets.warrior18.description')).toBe(
      'Bardziej wymagający wariant postu z 6-godzinnym oknem żywieniowym.',
    );
    expect(i18n.t('fastingProtocol.presets.warrior20.description')).toBe(
      'Zjedz jeden większy posiłek lub rozłóż kalorie w 4-godzinnym oknie żywieniowym.',
    );
    expect(i18n.t('fastingProtocol.presets.circadian.description')).toBe(
      'Pość od zachodu słońca do rana.',
    );
    expect(i18n.t('fastingProtocol.presets.custom.description')).toBe(
      'Ustaw własny czas postu.',
    );
  });
});
