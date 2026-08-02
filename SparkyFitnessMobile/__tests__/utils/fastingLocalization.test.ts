import { createInstance, type TFunction } from 'i18next';
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
import en from '../../src/localization/locales/en/translation.json';
import pl from '../../src/localization/locales/pl/translation.json';
import { formatDate } from '../../src/utils/dateUtils';

jest.mock('../../src/localization', () => ({
  ...jest.requireActual('../../src/localization'),
  getAppLocale: () => (globalThis.__activeWorkoutTestLocale === 'pl' ? 'pl-PL' : 'en-US'),
}));

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & { __activeWorkoutTestLocale?: string }).__activeWorkoutTestLocale = locale;
}

const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key}:${JSON.stringify(options)}` : key;

const realI18n = createInstance({
  resources: { en: { translation: en }, pl: { translation: pl } },
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
realI18n.init({ lng: 'en', initImmediate: false });

const realT = (): TFunction => realI18n.t.bind(realI18n) as TFunction;

function buildLog(overrides: Partial<FastingLog> = {}): FastingLog {
  return {
    id: 'fast-1', user_id: 'user-1', start_time: new Date().toISOString(), end_time: null,
    target_end_time: null, duration_minutes: 60, fasting_type: '16:8 Leangains', status: 'COMPLETED',
    created_at: null, updated_at: null, ...overrides,
  };
}

describe('fasting localization helper', () => {
  afterEach(() => jest.useRealTimers());

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

  it.each([
    ['en', ['16:8 Leangains', '18:6 Warrior', '20:4 Warrior', 'Circadian Rhythm', 'Custom Fast'], [
      'Skip breakfast and eat during an 8-hour window.',
      'More aggressive fast with a 6-hour eating window.',
      'Eat one large meal or spread calories over 4 hours.',
      'Fast from sunset to morning.',
      'Set your own fasting duration.',
    ]],
    ['pl', ['16:8 Leangains', '18:6 Warrior', '20:4 Warrior', 'Rytm dobowy', 'Własny post'], [
      'Pomiń śniadanie i jedz w 8-godzinnym oknie.',
      'Bardziej intensywny post z 6-godzinnym oknem żywieniowym.',
      'Zjedz jeden duży posiłek lub rozłóż kalorie na 4 godziny.',
      'Pość od zachodu słońca do rana.',
      'Ustaw własny czas trwania postu.',
    ]],
  ] as const)('resolves all protocol names and descriptions with real i18next in %s', (locale, names, descriptions) => {
    setTestLocale(locale);
    realI18n.changeLanguage(locale);
    const translate = realT();
    expect(FASTING_PRESETS.map((preset) => getFastingPresetDisplayName(translate, preset))).toEqual(names);
    expect(FASTING_PRESETS.map((preset) => getFastingPresetDescription(translate, preset))).toEqual(descriptions);
  });

  it.each([
    ['en', ['Anabolic', 'Catabolic', 'Fat burning', 'Ketosis', 'Deep ketosis']],
    ['pl', ['Faza anaboliczna', 'Faza kataboliczna', 'Spalanie tłuszczu', 'Ketoza', 'Głęboka ketoza']],
  ] as const)('resolves all metabolic stages with real i18next in %s', (locale, expected) => {
    setTestLocale(locale);
    realI18n.changeLanguage(locale);
    expect(METABOLIC_STAGES.map((stage) => getFastingStageName(realT(), stage))).toEqual(expected);
  });

  it.each([
    ['en', ['0m', '47m', '1h 47m', '16h 4m']],
    ['pl', ['0 min', '47 min', '1 godz. 47 min', '16 godz. 4 min']],
  ] as const)('formats all required durations with real i18next in %s', (locale, expected) => {
    setTestLocale(locale);
    realI18n.changeLanguage(locale);
    const translate = realT();
    expect([
      formatLocalizedFastingDuration(translate, 0),
      formatLocalizedFastingDuration(translate, 47 * 60000),
      formatLocalizedFastingDuration(translate, 107 * 60000),
      formatLocalizedFastingDuration(translate, 964 * 60000),
    ]).toEqual(expected);
  });

  it('formats null-duration logs as null and date variants with static keys', () => {
    expect(formatLocalizedLastFast(t, null)).toBeNull();
    expect(formatLocalizedLastFast(t, buildLog({ duration_minutes: null }))).toBeNull();
    expect(formatLocalizedLastFast(t, buildLog({ end_time: new Date().toISOString() }))).toContain('fasting.card.lastFastToday');
    expect(formatLocalizedLastFast(t, buildLog({ end_time: new Date(Date.now() - 86400000).toISOString() }))).toContain('fasting.card.lastFastYesterday');
    expect(formatLocalizedLastFast(t, buildLog({ end_time: '2026-01-06T12:00:00.000Z' }))).toContain('fasting.card.lastFastDate');
  });

  it.each([
    ['en', 'Last fast: 16h 4m', 'Last fast: 16h 4m · today', 'Last fast: 16h 4m · yesterday'],
    ['pl', 'Ostatni post: 16 godz. 4 min', 'Ostatni post: 16 godz. 4 min · dzisiaj', 'Ostatni post: 16 godz. 4 min · wczoraj'],
  ] as const)('formats today and yesterday last fast labels in %s', (locale, plain, today, yesterday) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));
    setTestLocale(locale);
    realI18n.changeLanguage(locale);
    const translate = realT();
    expect(formatLocalizedLastFast(translate, buildLog({ duration_minutes: 964, start_time: '' }))).toBe(plain);
    expect(formatLocalizedLastFast(translate, buildLog({ duration_minutes: 964, end_time: '2026-02-15T10:00:00.000Z' }))).toBe(today);
    expect(formatLocalizedLastFast(translate, buildLog({ duration_minutes: 964, end_time: '2026-02-14T10:00:00.000Z' }))).toBe(yesterday);
  });

  it.each([
    ['en', 'Last fast: 16h 4m · Fri, Feb 13'],
    ['pl', 'Ostatni post: 16 godz. 4 min · pt., 13 lut'],
  ] as const)('formats a localized calendar date in %s', (locale, expected) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));
    setTestLocale(locale);
    realI18n.changeLanguage(locale);
    const reference = '2026-02-13T10:00:00.000Z';
    expect(formatLocalizedLastFast(realT(), buildLog({ duration_minutes: 964, end_time: reference }))).toBe(expected);
    expect(formatDate('2026-02-13')).toBe(locale === 'en' ? 'Fri, Feb 13' : 'pt., 13 lut');
  });
});
