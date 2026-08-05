import {
  buildWorkoutLiveActivityLabels,
  isWorkoutLiveActivityLocale,
  resolveWorkoutLiveActivityLocale,
} from '../../src/services/workoutLiveActivityLabels';
import i18n, { initializeI18n } from '../../src/localization/i18n';

const EN_EXPECTED = {
  rest: 'Rest',
  paused: 'Paused',
  elapsed: 'Elapsed',
  workoutComplete: 'Workout complete',
  complete: 'Complete',
  addFifteenSeconds: 'Add 15 seconds',
  addFifteenSecondsShort: '+15s',
  skipRest: 'Skip rest',
  workout: 'Workout',
  exercise: 'Exercise',
  set: 'Set',
  setOf: 'of',
};

const PL_EXPECTED = {
  rest: 'Odpoczynek',
  paused: 'Wstrzymano',
  elapsed: 'Czas',
  workoutComplete: 'Trening ukończony',
  complete: 'Ukończ',
  addFifteenSeconds: 'Dodaj 15 sekund',
  addFifteenSecondsShort: '+15 s',
  skipRest: 'Pomiń odpoczynek',
  workout: 'Trening',
  exercise: 'Ćwiczenie',
  set: 'Seria',
  setOf: 'z',
};

describe('workoutLiveActivityLabels', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  describe('buildWorkoutLiveActivityLabels', () => {
    it('returns the full English label set', () => {
      expect(buildWorkoutLiveActivityLabels('en')).toEqual(EN_EXPECTED);
    });

    it('returns the full Polish label set with correct characters', () => {
      const labels = buildWorkoutLiveActivityLabels('pl');
      expect(labels).toEqual(PL_EXPECTED);
      expect(labels.rest).toContain('Odpoczynek');
      expect(labels.complete).toContain('Ukończ');
      expect(labels.exercise).toContain('Ćwiczenie');
      expect(labels.set).toContain('Seria');
    });

    it('contains no i18next placeholder syntax', () => {
      for (const locale of ['en', 'pl']) {
        const labels = buildWorkoutLiveActivityLabels(locale as 'en' | 'pl');
        for (const value of Object.values(labels)) {
          expect(value).not.toMatch(/\{\{/);
          expect(value).not.toMatch(/\}\}/);
        }
      }
    });

    it('serializes to plain strings (no functions or objects)', () => {
      for (const locale of ['en', 'pl']) {
        const labels = buildWorkoutLiveActivityLabels(locale as 'en' | 'pl');
        for (const value of Object.values(labels)) {
          expect(typeof value).toBe('string');
        }
        // The object must be JSON-round-trippable.
        const roundTripped = JSON.parse(JSON.stringify(labels));
        expect(roundTripped).toEqual(labels);
      }
    });
  });

  describe('locale helpers', () => {
    it('resolves only en and pl to themselves', () => {
      expect(resolveWorkoutLiveActivityLocale('en')).toBe('en');
      expect(resolveWorkoutLiveActivityLocale('pl')).toBe('pl');
      expect(resolveWorkoutLiveActivityLocale('PL')).toBe('pl');
    });

    it('falls back to English for unsupported languages and missing values', () => {
      expect(resolveWorkoutLiveActivityLocale('de')).toBe('en');
      expect(resolveWorkoutLiveActivityLocale('fr-FR')).toBe('en');
      expect(resolveWorkoutLiveActivityLocale(null)).toBe('en');
      expect(resolveWorkoutLiveActivityLocale(undefined)).toBe('en');
      expect(resolveWorkoutLiveActivityLocale('')).toBe('en');
    });

    it('isWorkoutLiveActivityLocale narrows en and pl only', () => {
      expect(isWorkoutLiveActivityLocale('en')).toBe(true);
      expect(isWorkoutLiveActivityLocale('pl')).toBe(true);
      expect(isWorkoutLiveActivityLocale('de')).toBe(false);
      expect(isWorkoutLiveActivityLocale(null)).toBe(false);
      expect(isWorkoutLiveActivityLocale(undefined)).toBe(false);
    });
  });
});
