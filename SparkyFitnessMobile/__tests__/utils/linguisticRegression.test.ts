import i18n, { initializeI18n } from '../../src/localization/i18n';
import { formatLocalizedNumber } from '../../src/localization';
import {
  localizeCycleSymptom,
  localizeCycleAnomaly,
  localizeCycleAlert,
} from '../../src/utils/cycleLocalization';

describe('linguistic correctness regression (cycle / EN contamination)', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  describe('EN locale contamination', () => {
    test('cycleCorrelations metrics/phases render English (Sleep, Ovulation, not Sen/Owulacja)', () => {
      expect(i18n.t('cycleCorrelations.metrics.sleep', { defaultValue: 'Sleep' })).toBe('Sleep');
      expect(i18n.t('cycleCorrelations.phases.ovulation', { defaultValue: 'Ovulation' })).toBe('Ovulation');
    });
  });

  describe('cycleCorrelations grammatical agreement', () => {
    const metrics = ['Masa ciała', 'Energia', 'Nastrój', 'Sen'];
    test('peak sentence agrees with every metric gender in PL', async () => {
      await i18n.changeLanguage('pl');
      for (const metric of metrics) {
        const sentence = i18n.t('cycleCorrelations.peak', {
          defaultValue: '{{metric}} tends to be {{direction}} in your {{phase}} phase ({{delta}}{{unit}} vs your average).',
          metric,
          direction: i18n.t('cycleCorrelations.higher', { defaultValue: 'higher' }),
          phase: i18n.t('cycleCorrelations.phases.follicular', { defaultValue: 'Follicular' }),
          delta: '1,5',
          unit: ' kg',
        });
        // The gender-invariant "Wartość dla ... wyższa" construction must hold
        // for every metric noun.
        expect(sentence).toContain('jest zwykle wyższa');
      }
    });

    test('cycleInsights.regularity is English not Polish', () => {
      expect(i18n.t('cycleInsights.regularity', { defaultValue: 'Regularity' })).toBe('Regularity');
    });
  });

  describe('cycleInsights.days pluralization', () => {
    const enCases: Array<[number, string]> = [
      [1, '1 day'],
      [2, '2 days'],
      [5, '5 days'],
      [12, '12 days'],
      [22, '22 days'],
      [25, '25 days'],
    ];
    const plCases: Array<[number, string]> = [
      [1, '1 dzień'],
      [2, '2 dni'],
      [5, '5 dni'],
      [12, '12 dni'],
      [22, '22 dni'],
      [25, '25 dni'],
    ];
    test('EN', async () => {
      await i18n.changeLanguage('en');
      for (const [n, expected] of enCases) {
        expect(i18n.t('cycleInsights.days', { defaultValue: '{{count}} days', count: n })).toBe(expected);
      }
    });
    test('PL', async () => {
      await i18n.changeLanguage('pl');
      for (const [n, expected] of plCases) {
        expect(i18n.t('cycleInsights.days', { defaultValue: '{{count}} days', count: n })).toBe(expected);
      }
    });
  });

  describe('cycleHistory.dayPeriod pluralization', () => {
    const enCases: Array<[number, string]> = [
      [1, '1 day period'],
      [2, '2 day periods'],
      [5, '5 day periods'],
    ];
    const plCases: Array<[number, string]> = [
      [1, '1 dzień miesiączki'],
      [2, '2 dni miesiączki'],
      [5, '5 dni miesiączki'],
      [12, '12 dni miesiączki'],
      [22, '22 dni miesiączki'],
      [25, '25 dni miesiączki'],
    ];
    test('EN', async () => {
      await i18n.changeLanguage('en');
      for (const [n, expected] of enCases) {
        expect(i18n.t('cycleHistory.dayPeriod', { defaultValue: '{{count}} day period', count: n })).toBe(expected);
      }
    });
    test('PL (1 dni -> 1 dzień)', async () => {
      await i18n.changeLanguage('pl');
      for (const [n, expected] of plCases) {
        expect(i18n.t('cycleHistory.dayPeriod', { defaultValue: '{{count}} day period', count: n })).toBe(expected);
      }
    });
  });

  describe('PL correlation decimal formatting', () => {
    test('formatLocalizedNumber uses comma in PL, dot in EN', async () => {
      await i18n.changeLanguage('en');
      expect(formatLocalizedNumber(1.55)).toBe('1.55');
      await i18n.changeLanguage('pl');
      expect(formatLocalizedNumber(1.55)).toBe('1,55');
    });
  });
});

describe('cycle controlled server/shared presentation', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  describe('localizeCycleAnomaly', () => {
    const fallback = 'You had a short cycle of 20 days.';
    test('EN anonymous copy for controlled keys', async () => {
      await i18n.changeLanguage('en');
      expect(localizeCycleAnomaly('short_cycle', fallback, i18n.t)).toContain('short cycle');
      expect(localizeCycleAnomaly('heavy_bleeding', fallback, i18n.t)).toContain('heavier flow');
    });
    test('PL anonymous copy is localized, not English', async () => {
      await i18n.changeLanguage('pl');
      const pl = localizeCycleAnomaly('short_cycle', fallback, i18n.t);
      expect(pl).not.toContain('short cycle');
      expect(pl).toContain('cykl');
      expect(localizeCycleAnomaly('unusual_discharge', fallback, i18n.t)).toContain('wydzielin');
    });
    test('unknown key falls back to the server message literally', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAnomaly('unknown_future_key', fallback, i18n.t)).toBe(fallback);
    });
  });

  describe('localizeCycleAlert', () => {
    test('PL alert copy localized for late_period/ovulation_today', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAlert('late_period', 'Your period is late', i18n.t)).toContain('miesiączka');
      expect(localizeCycleAlert('ovulation_today', 'ovul today', i18n.t).toLowerCase()).toContain('owulacja');
    });
    test('unknown alert key falls back literally', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAlert('unknown_key', 'Raw server text', i18n.t)).toBe('Raw server text');
    });
  });

  describe('localizeCycleSymptom', () => {
    test('known built-in symptoms map to localized labels (EN and PL)', async () => {
      await i18n.changeLanguage('en');
      expect(localizeCycleSymptom('Cramps', i18n.t)).toBe('Cramps');
      expect(localizeCycleSymptom('Tender breasts', i18n.t)).toBe('Tender breasts');
      expect(localizeCycleSymptom('Mood swings', i18n.t)).toBe('Mood swings');

      await i18n.changeLanguage('pl');
      expect(localizeCycleSymptom('Cramps', i18n.t)).toBe('Skurcze');
      expect(localizeCycleSymptom('Tender breasts', i18n.t)).toBe('Tkliwość piersi');
      expect(localizeCycleSymptom('Mood swings', i18n.t)).toBe('Wahania nastroju');
      expect(localizeCycleSymptom('Headache', i18n.t)).toBe('Ból głowy');
      expect(localizeCycleSymptom('Bloating', i18n.t)).toBe('Wzdęcia');
      expect(localizeCycleSymptom('Fatigue', i18n.t)).toBe('Zmęczenie');
      expect(localizeCycleSymptom('Backache', i18n.t)).toBe('Ból pleców');
      expect(localizeCycleSymptom('Nausea', i18n.t)).toBe('Nudności');
      expect(localizeCycleSymptom('Spotting', i18n.t)).toBe('Plamienie');
    });
    test('unknown/custom symptom remains literal', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleSymptom('my custom symptom', i18n.t)).toBe('my custom symptom');
    });
    test('null/empty returns empty', async () => {
      expect(localizeCycleSymptom(null, i18n.t)).toBe('');
      expect(localizeCycleSymptom('', i18n.t)).toBe('');
    });
  });
});

describe('medication / workout terminology', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  test('medication Strength uses natural pharmaceutical term in PL (Moc)', async () => {
    await i18n.changeLanguage('pl');
    expect(i18n.t('medications.form.strength', { defaultValue: 'Strength' })).toBe('Moc');
  });
  test('workout unit labels use standard lowercase symbols', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('workout.kg', { defaultValue: 'kg' })).toBe('kg');
    expect(i18n.t('workout.lbs', { defaultValue: 'lbs' })).toBe('lbs');
    await i18n.changeLanguage('pl');
    expect(i18n.t('workout.kg', { defaultValue: 'kg' })).toBe('kg');
    expect(i18n.t('workout.lbs', { defaultValue: 'lbs' })).toBe('lbs');
  });
  test('workout best/last labels use complete Polish nouns', async () => {
    await i18n.changeLanguage('pl');
    expect(i18n.t('workout.best', { defaultValue: 'Best ({{unit}})', unit: 'kg' })).toBe('Najlepszy wynik (kg)');
    expect(i18n.t('workout.last', { defaultValue: 'Last ({{unit}})', unit: 'kg' })).toBe('Ostatni wynik (kg)');
  });
});
