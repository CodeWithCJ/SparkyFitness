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

    it('never leaks raw i18next key paths into the label object', () => {
      for (const locale of ['en', 'pl']) {
        const labels = buildWorkoutLiveActivityLabels(locale as 'en' | 'pl');
        for (const value of Object.values(labels)) {
          expect(value).not.toContain('activeWorkout.liveActivity.');
        }
      }
    });

    it('reads English labels from the i18n catalog when initialized', () => {
      // The EN catalog must be the source of truth once i18n is ready, not a
      // hardcoded map: editing the EN translation must change the Live
      // Activity text (e.g. before Weblate takes over).
      const keyPath = 'activeWorkout.liveActivity.rest';
      const original = (i18n.getResource('en', 'translation', keyPath) ??
        'Rest') as string;
      try {
        i18n.addResource('en', 'translation', keyPath, 'Recovery');
        expect(buildWorkoutLiveActivityLabels('en').rest).toBe('Recovery');
      } finally {
        i18n.addResource('en', 'translation', keyPath, original);
      }
    });

    it('returns the English fallback when a Polish key is missing', () => {
      const keyPath = 'activeWorkout.liveActivity.skipRest';
      const original = (i18n.getResource('pl', 'translation', keyPath) ??
        'Pomiń odpoczynek') as string;
      try {
        // Simulate a missing/empty PL resource entry: i18next must not return
        // the raw key path, and the English fallback must win.
        i18n.addResource('pl', 'translation', keyPath, '');
        const labels = buildWorkoutLiveActivityLabels('pl');
        expect(labels.skipRest).toBe('Skip rest');
        expect(labels.skipRest).not.toContain('activeWorkout.liveActivity.');
      } finally {
        i18n.addResource('pl', 'translation', keyPath, original);
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

    it('isWorkoutLiveActivityLocale returns false for the raw key path', () => {
      expect(isWorkoutLiveActivityLocale('activeWorkout.liveActivity.rest')).toBe(false);
    });
  });
});
