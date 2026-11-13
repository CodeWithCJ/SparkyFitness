import type { CompareQuestion } from '@workspace/shared';
import {
  loadRecentQuestions,
  saveRecentQuestion,
} from '@/pages/Reports/Compare/compareRecents';

const OLD_KEY = 'sparky.compareRecentQuestions.v1';
const KEY = `${OLD_KEY}.user-1`;

const Q = (b: CompareQuestion['b']): CompareQuestion => ({
  a: 'timeAsleep',
  b,
  choice: 'sameDay',
});

describe('compareRecents', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => jest.restoreAllMocks());

  test('loadRecentQuestions drops an unknown metric and non-JSON, keeps a sinceHabit choice, and returns [] when localStorage.getItem throws', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify([
        { a: 'timeAsleep', b: 'energy', choice: 'sameDay' },
        { a: 'nonsense', b: 'energy', choice: 'sameDay' },
        { a: 'meditated', b: 'mood', choice: 'sinceHabit' },
      ])
    );
    expect(loadRecentQuestions('user-1')).toEqual([
      Q('energy'),
      { a: 'meditated', b: 'mood', choice: 'sinceHabit' },
    ]);

    window.localStorage.setItem(KEY, 'not json {');
    expect(loadRecentQuestions('user-1')).toEqual([]);

    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadRecentQuestions('user-1')).toEqual([]);
  });

  test('a stored weight-trend since recent is dropped', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify([
        { a: 'meditated', b: 'weightTrend', choice: 'sinceHabit' },
        { a: 'weightTrend', b: 'mood', choice: 'sinceHabit' },
        { a: 'meditated', b: 'weightTrend', choice: 'sameDay' },
      ])
    );
    expect(loadRecentQuestions('user-1')).toEqual([
      { a: 'meditated', b: 'weightTrend', choice: 'sameDay' },
    ]);
  });

  test('saveRecentQuestion keeps the newest five without duplicates', () => {
    const keys = [
      'energy',
      'mood',
      'focus',
      'sleepScore',
      'overnightHrv',
    ] as const;
    keys.forEach((b) => saveRecentQuestion('user-1', Q(b)));
    const again = saveRecentQuestion('user-1', Q('energy'));
    expect(again.map((q) => q.b)).toEqual([
      'energy',
      'overnightHrv',
      'sleepScore',
      'focus',
      'mood',
    ]);
    const sixth = saveRecentQuestion('user-1', Q('restingHeartRate'));
    expect(sixth).toHaveLength(5);
    expect(sixth[0]?.b).toBe('restingHeartRate');
    expect(loadRecentQuestions('user-1')).toEqual(sixth);
  });

  test('saveRecentQuestion still returns the list when setItem throws', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(saveRecentQuestion('user-1', Q('energy'))).toEqual([Q('energy')]);
  });

  test('each account keeps its own list, and the older unkeyed list is ignored', () => {
    window.localStorage.setItem(OLD_KEY, JSON.stringify([Q('mood')]));
    expect(loadRecentQuestions('user-1')).toEqual([]);

    saveRecentQuestion('user-1', Q('energy'));
    saveRecentQuestion('user-2', Q('focus'));
    expect(loadRecentQuestions('user-1')).toEqual([Q('energy')]);
    expect(loadRecentQuestions('user-2')).toEqual([Q('focus')]);
    expect(window.localStorage.getItem(KEY)).toContain('energy');
    expect(window.localStorage.getItem(OLD_KEY)).toContain('mood');
  });

  test('without an account nothing is read or stored', () => {
    window.localStorage.setItem(KEY, JSON.stringify([Q('energy')]));
    expect(loadRecentQuestions(undefined)).toEqual([]);
    expect(saveRecentQuestion(undefined, Q('mood'))).toEqual([Q('mood')]);
    expect(window.localStorage.length).toBe(1);
  });
});
