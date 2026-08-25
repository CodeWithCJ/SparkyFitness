/**
 * Regression tests for the rest-complete notification body.
 *
 * Pre-fix: the notification body was built with hardcoded English template
 * literals: `Set ${setNumber} of ${setCount}`, `${reps} rep${reps === 1 ? '' : 's'} target`.
 *
 * Post-fix: the body uses semantic i18next keys with proper plural categories
 * and locale-aware number formatting. These tests read the ACTUAL catalogs
 * (not just inline defaultValues) and assert the final body payload does not
 * contain raw English fragments when the app language is PL.
 */
import { act } from '@testing-library/react-native';
import i18n from '../../src/localization/i18n';
import { initReactI18next } from 'react-i18next';
import enTranslation from '../../src/localization/locales/en/translation.json';
import plTranslation from '../../src/localization/locales/pl/translation.json';

// jest.setup.js initializes i18n with EMPTY catalogs. For notification
// body regression tests we need the REAL catalogs so that PL translations
// are actually resolved and we can assert the final body payload.
beforeAll(() => {
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      resources: { en: { translation: enTranslation }, pl: { translation: plTranslation } },
      lng: 'en',
      fallbackLng: 'en',
      initImmediate: false,
      interpolation: { escapeValue: false },
      returnEmptyString: false,
    });
  } else {
    // Already initialized by jest.setup.js with empty resources — reload
    i18n.addResourceBundle('en', 'translation', enTranslation, true, true);
    i18n.addResourceBundle('pl', 'translation', plTranslation, true, true);
  }
});
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import type { PresetSessionResponse } from '@workspace/shared';

jest.mock('../../src/services/notifications', () => ({
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteCue: jest.fn(),
  COMPLETE_SET_ACTION: 'complete-set',
  addNotificationResponseListener: jest.fn(() => ({ remove: jest.fn() })),
  dismissDeliveredNotification: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
  fireSelectionHaptic: jest.fn(),
}));

jest.mock('../../src/utils/ids', () => ({ newUuid: jest.fn(() => 'uuid-test') }));

const { scheduleRestNotification } = require('../../src/services/notifications');
const mockSchedule = scheduleRestNotification as jest.MockedFunction<typeof scheduleRestNotification>;

function buildSessionWithSet(opts: {
  exerciseName?: string;
  setNumber?: number;
  setCount?: number;
  reps?: number | null;
  durationSec?: number | null;
}): PresetSessionResponse {
  const exerciseName = opts.exerciseName ?? 'Bench Press';
  const setCount = opts.setCount ?? 3;
  const reps = opts.reps ?? null;
  const durationSec = opts.durationSec ?? null;
  return {
    id: 'session-1',
    name: 'Test',
    exercises: [
      {
        id: 'ex-1',
        exercise_snapshot: { name: exerciseName },
        sets: Array.from({ length: setCount }, (_, i) => ({
          id: `set-${i + 1}`,
          set_number: i + 1,
          reps: durationSec != null ? null : reps,
          weight: null,
          rest_time: null,
          set_type: 'standard',
          notes: null,
        })),
      },
    ],
    supersets: [],
  } as unknown as PresetSessionResponse;
}

describe('buildRestNotificationContent — localization', () => {
  beforeEach(() => {
    __resetActiveWorkoutStoreForTests();
    mockSchedule.mockClear();
    mockSchedule.mockResolvedValue('notif-abc');
    i18n.changeLanguage('en');
  });

  function captureNotificationContent(session: PresetSessionResponse, setId: string): { title?: string; body?: string } {
    const store = useActiveWorkoutStore.getState();
    store.startWorkout(session);
    // Complete the set to trigger rest -> notification scheduling
    act(() => store.completeSet(setId));
    const lastCall = mockSchedule.mock.calls[mockSchedule.mock.calls.length - 1];
    if (!lastCall) return { title: undefined, body: undefined };
    return (lastCall[2] as { title?: string; body?: string }) ?? {};
  }

  it('EN: body contains localized set progress from catalog', () => {
    i18n.changeLanguage('en');
    const session = buildSessionWithSet({ exerciseName: 'Bench Press', setNumber: 2, setCount: 3, reps: 5 });
    const content = captureNotificationContent(session, 'set-1');
    expect(content.body).toBeTruthy();
    // Body comes from the i18n catalog, not a hardcoded template literal.
    expect(content.body).toContain('Set 2 of 3');
    expect(content.body).toContain('Bench Press');
    expect(content.body).toContain('5 reps target');
    // Must NOT contain the old hardcoded "rep${reps === 1 ? '' : 's'}" pattern
    expect(content.body).not.toMatch(/rep(?!s|t)/);
  });

  it('EN: body uses i18next plural for 1 rep (singular)', () => {
    i18n.changeLanguage('en');
    const session = buildSessionWithSet({ exerciseName: 'Squat', setNumber: 2, setCount: 4, reps: 1 });
    const content = captureNotificationContent(session, 'set-1');
    expect(content.body).toContain('1 rep target');
    expect(content.body).not.toContain('1 reps');
  });

  it('EN: body uses i18next plural for 2 reps (plural)', () => {
    i18n.changeLanguage('en');
    const session = buildSessionWithSet({ exerciseName: 'Deadlift', setNumber: 1, setCount: 3, reps: 2 });
    const content = captureNotificationContent(session, 'set-1');
    expect(content.body).toContain('2 reps target');
  });

  it('PL: body does not contain raw English "Set ... of ..." or "target" or "rep"', () => {
    i18n.changeLanguage('pl');
    const session = buildSessionWithSet({ exerciseName: 'Wyciskanie', setNumber: 1, setCount: 3, reps: 5 });
    const content = captureNotificationContent(session, 'set-1');
    expect(content.body).toBeTruthy();
    // Must not contain raw English fragments in PL
    expect(content.body).not.toContain('Set ');
    expect(content.body).not.toContain(' of ');
    expect(content.body).not.toContain(' target');
    expect(content.body).not.toContain(' rep');
    expect(content.body).not.toContain(' reps');
    // Should contain Polish set progress (set 2 is announced after completing set 1)
    expect(content.body).toContain('Seria 2 z 3');
    expect(content.body).toContain('Wyciskanie');
  });

  it('PL: body uses correct plural form for 1 powtórzenie (one)', () => {
    i18n.changeLanguage('pl');
    const session = buildSessionWithSet({ exerciseName: 'Przysiad', setNumber: 1, setCount: 3, reps: 1 });
    const content = captureNotificationContent(session, 'set-1');
    expect(content.body).toContain('powtórzenie');
    expect(content.body).not.toContain('powtórzenia');
    expect(content.body).not.toContain('powtórzeń');
  });

  it('PL: body uses correct plural form for 2 powtórzenia (few)', () => {
    i18n.changeLanguage('pl');
    const session = buildSessionWithSet({ exerciseName: 'Przysiad', setNumber: 1, setCount: 3, reps: 2 });
    const content = captureNotificationContent(session, 'set-1');
    expect(content.body).toContain('powtórzenia');
    expect(content.body).not.toContain('powtórzenie');
    expect(content.body).not.toContain('powtórzeń');
  });

  it('PL: body uses correct plural form for 5 powtórzeń (many)', () => {
    i18n.changeLanguage('pl');
    const session = buildSessionWithSet({ exerciseName: 'Przysiad', setNumber: 1, setCount: 3, reps: 5 });
    const content = captureNotificationContent(session, 'set-1');
    expect(content.body).toContain('powtórzeń');
    expect(content.body).not.toContain('powtórzenie');
    expect(content.body).not.toContain('powtórzenia');
  });

  it('PL: duration body key uses "cel" not English "target"', () => {
    i18n.changeLanguage('pl');
    // The duration variant requires a duration-modality exercise snapshot,
    // which is complex to fixture. Instead verify the catalog key resolves
    // to Polish "cel" and not English "target".
    const body = i18n.t('notifications.rest.bodySetProgressDuration', {
      defaultValue: '{{setProgress}} · {{duration}} target',
      setProgress: 'Seria 1 z 2',
      duration: '1:00',
    });
    expect(body).toContain('cel');
    expect(body).not.toContain('target');
  });
});
