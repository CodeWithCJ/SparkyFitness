import i18n, { initializeI18n } from '../../src/localization/i18n';
import { formatLocalizedNumber } from '../../src/localization';
import { formatMetricWithUnit } from '../../src/components/wellness/CorrelationCards';
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
    test('complete peak sentence is grammatically valid for every phase (PL)', async () => {
      await i18n.changeLanguage('pl');
      const phaseKeys = [
        'menstrual',
        'follicular',
        'fertile',
        'ovulation',
        'luteal',
      ] as const;
      for (const phase of phaseKeys) {
        const phaseLabel = i18n.t(`cycleCorrelations.phasesSentence.${phase}`, {
          defaultValue: 'Phase',
        });
        const sentence = i18n.t('cycleCorrelations.peak', {
          defaultValue: '{{phase}}: {{metric}} tends to be {{direction}} ({{delta}}{{unit}} vs. your average).',
          metric: 'Masa ciała',
          direction: i18n.t('cycleCorrelations.higher', { defaultValue: 'higher' }),
          phase: phaseLabel,
          delta: '+1,5',
          unit: ' kg',
        });
        // The phase must appear with its noun ("Faza ..."), never the bare
        // nominative label following "w fazie".
        expect(phaseLabel).toMatch(/^(Faza |Owulacja)/);
        expect(sentence).toContain('jest zwykle wyższa');
        expect(sentence).not.toMatch(/w fazie (Folikularna|Lutealna|Miesiączkowa|Płodna)/);
        expect(sentence.startsWith(phaseLabel)).toBe(true);
      }
    });

    test('complete EN peak sentence with sentence-safe phase labels', async () => {
      await i18n.changeLanguage('en');
      const sentence = i18n.t('cycleCorrelations.peak', {
        defaultValue: '{{phase}}: {{metric}} tends to be {{direction}} ({{delta}}{{unit}} vs. your average).',
        metric: 'Weight',
        direction: i18n.t('cycleCorrelations.higher', { defaultValue: 'higher' }),
        phase: i18n.t('cycleCorrelations.phasesSentence.follicular', { defaultValue: 'Follicular phase' }),
        delta: '+1.5',
        unit: ' kg',
      });
      expect(sentence).toBe('Follicular phase: Weight tends to be higher (+1.5 kg vs. your average).');
    });

    test('cycleInsights.regularity is English not Polish', () => {
      expect(i18n.t('cycleInsights.regularity', { defaultValue: 'Regularity' })).toBe('Regularity');
    });
  });

  describe('cycleInsights.days pluralization', () => {
    const enCases: [number, string][] = [
      [1, '1 day'],
      [2, '2 days'],
      [5, '5 days'],
      [12, '12 days'],
      [22, '22 days'],
      [25, '25 days'],
    ];
    const plCases: [number, string][] = [
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
    const enCases: [number, string][] = [
      [1, '1 day period'],
      [2, '2 day periods'],
      [5, '5 day periods'],
    ];
    const plCases: [number, string][] = [
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

    test('formatMetricWithUnit inserts a space before a real unit and none for dimensionless', async () => {
      await i18n.changeLanguage('en');
      expect(formatMetricWithUnit(65.5, 'kg')).toBe('65.5 kg');
      expect(formatMetricWithUnit(7.5, 'h')).toBe('7.5 h');
      expect(formatMetricWithUnit(4, '')).toBe('4');
      await i18n.changeLanguage('pl');
      expect(formatMetricWithUnit(65.5, 'kg')).toBe('65,5 kg');
      expect(formatMetricWithUnit(7.5, 'h')).toBe('7,5 h');
      expect(formatMetricWithUnit(4, '')).toBe('4');
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
    test('EN dynamic copy preserves the cycle length count', async () => {
      await i18n.changeLanguage('en');
      const one = localizeCycleAnomaly('short_cycle', fallback, i18n.t, { cycleLength: 20 });
      expect(one).toBe('You had a short cycle of 20 days. Cycles shorter than 21 days are worth tracking.');
      expect(localizeCycleAnomaly('long_cycle', fallback, i18n.t, { cycleLength: 47 })).toContain('47 days');
    });
    test('PL short/long cycle copy is neutral and preserves the length', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAnomaly('short_cycle', fallback, i18n.t, { cycleLength: 20 })).toBe(
        'Zarejestrowano krótki cykl trwający 20 dni.',
      );
      expect(localizeCycleAnomaly('long_cycle', fallback, i18n.t, { cycleLength: 47 })).toBe(
        'Zarejestrowano długi cykl trwający 47 dni.',
      );
    });
    test('known keys with MISSING params stay localized (generic fallback, not English)', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAnomaly('short_cycle', 'You had a short cycle of 20 days.', i18n.t, undefined)).toBe(
        'Zarejestrowano krótki cykl. Warto monitorować cykle krótsze niż 21 dni.',
      );
      expect(localizeCycleAnomaly('long_cycle', 'You had a long cycle of 47 days.', i18n.t, undefined)).toBe(
        'Zarejestrowano długi cykl. Warto monitorować cykle dłuższe niż 45 dni.',
      );
    });
    test('PL anomaly copy avoids unnecessary gendered forms', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAnomaly('unusual_discharge', fallback, i18n.t, undefined)).not.toContain('Zanotowałaś');
      expect(localizeCycleAnomaly('unusual_discharge', fallback, i18n.t, undefined)).toContain('Zanotowano');
      expect(localizeCycleAnomaly('heavy_bleeding', fallback, i18n.t, undefined)).not.toMatch(/Miałaś|Zanotowałaś/);
    });
    test('unknown key falls back to the server message literally', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAnomaly('future_unknown_key', 'Future server text', i18n.t, undefined)).toBe('Future server text');
    });
    test('short_cycle with params keeps the richer dynamic path (not the generic fallback)', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAnomaly('short_cycle', 'fallback', i18n.t, { cycleLength: 20 })).toBe(
        'Zarejestrowano krótki cykl trwający 20 dni.',
      );
    });
  });

  describe('localizeCycleAlert day counts', () => {
    const enLate: [number, string][] = [
      [1, 'Your period is 1 day late.'],
      [2, 'Your period is 2 days late.'],
      [5, 'Your period is 5 days late.'],
    ];
    const plLate: [number, string][] = [
      [1, 'Miesiączka jest opóźniona o 1 dzień.'],
      [2, 'Miesiączka jest opóźniona o 2 dni.'],
      [5, 'Miesiączka jest opóźniona o 5 dni.'],
      [12, 'Miesiączka jest opóźniona o 12 dni.'],
      [22, 'Miesiączka jest opóźniona o 22 dni.'],
      [25, 'Miesiączka jest opóźniona o 25 dni.'],
    ];
    const plUpcoming: [number, string][] = [
      [0, 'Miesiączka jest spodziewana dziś.'],
      [1, 'Miesiączka jest spodziewana za 1 dzień.'],
      [2, 'Miesiączka jest spodziewana za 2 dni.'],
      [5, 'Miesiączka jest spodziewana za 5 dni.'],
    ];
    test('EN late_period days', async () => {
      await i18n.changeLanguage('en');
      for (const [n, expected] of enLate) {
        expect(localizeCycleAlert('late_period', 'late', i18n.t, { days: n })).toBe(expected);
      }
    });
    test('PL late_period days 1/2/5/12/22/25', async () => {
      await i18n.changeLanguage('pl');
      for (const [n, expected] of plLate) {
        expect(localizeCycleAlert('late_period', 'late', i18n.t, { days: n })).toBe(expected);
      }
    });
    test('PL upcoming_period days', async () => {
      await i18n.changeLanguage('pl');
      for (const [n, expected] of plUpcoming) {
        expect(localizeCycleAlert('upcoming_period', 'upcoming', i18n.t, { days: n })).toBe(expected);
      }
    });
    test('upcoming_period days 0/1/2/5 in EN (days=0 -> today)', async () => {
      const enCases: [number, string][] = [
        [0, 'Period is expected today.'],
        [1, 'Period is expected in 1 day.'],
        [2, 'Period is expected in 2 days.'],
        [5, 'Period is expected in 5 days.'],
      ];
      await i18n.changeLanguage('en');
      for (const [n, expected] of enCases) {
        expect(localizeCycleAlert('upcoming_period', 'upcoming', i18n.t, { days: n })).toBe(expected);
      }
    });
    test('upcoming_period_today key renders today copy', async () => {
      await i18n.changeLanguage('en');
      expect(localizeCycleAlert('upcoming_period_today', 'today', i18n.t, undefined)).toBe('Period is expected today.');
      await i18n.changeLanguage('pl');
      expect(localizeCycleAlert('upcoming_period_today', 'today', i18n.t, undefined)).toBe('Miesiączka jest spodziewana dziś.');
    });
    test('PL ovulation_today localized', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAlert('ovulation_today', 'ovul today', i18n.t, undefined)).toBe(
        'Owulacja przewidywana jest na dziś.',
      );
    });
    test('missing params falls back to the server message literally', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAlert('late_period', 'Raw late text', i18n.t, undefined)).toBe('Raw late text');
    });
    test('unknown alert key falls back literally', async () => {
      await i18n.changeLanguage('pl');
      expect(localizeCycleAlert('unknown_key', 'Raw server text', i18n.t, undefined)).toBe('Raw server text');
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
