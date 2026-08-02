import React from 'react';
import { ActivityIndicator } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import FastingCard from '../../src/components/FastingCard';
import { METABOLIC_STAGES } from '../../src/constants/fasting';
import type { FastingLog } from '../../src/types/fasting';
import type { FastTimerValues } from '../../src/utils/fasting';

let mockCurrentFast: FastingLog | null = null;
let mockHistory: FastingLog[] = [];
let mockIsLoading = false;
let mockTimer: FastTimerValues;
const mockProtocolPresent = jest.fn();
const mockHistoryPresent = jest.fn();

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & { __setTestLocale: (value: 'en' | 'pl') => void }).__setTestLocale(locale);
}

function buildTimer(overrides: Partial<FastTimerValues> = {}): FastTimerValues {
  return {
    elapsedMs: 0, elapsedHours: 0, remainingMs: 0, progress: 0, hasGoal: true, goalHours: 16,
    stage: METABOLIC_STAGES[0], hhmmss: '01:02:03', elapsedLabel: '1h 2m', remainingLabel: '47m',
    ...overrides,
  };
}

function buildFast(overrides: Partial<FastingLog> = {}): FastingLog {
  return {
    id: 'fast-1', user_id: 'user-1', start_time: '2026-01-06T08:00:00.000Z', end_time: null,
    target_end_time: '2026-01-07T00:00:00.000Z', duration_minutes: null,
    fasting_type: '16:8 Leangains', status: 'ACTIVE', created_at: null, updated_at: null, ...overrides,
  };
}

jest.mock('../../src/hooks/useFasting', () => ({
  useCurrentFast: () => ({ data: mockCurrentFast, isLoading: mockIsLoading }),
  useFastingHistory: () => ({ data: mockHistory }),
}));
jest.mock('../../src/hooks/useFastingTimer', () => ({ useFastingTimer: () => mockTimer }));
jest.mock('../../src/components/Icon', () => () => null);
jest.mock('../../src/components/FastingProtocolSheet', () => {
  const ReactNative = require('react');
  return {
    __esModule: true,
    default: ReactNative.forwardRef((_props: unknown, ref: React.Ref<{ present: (id?: string) => void; dismiss: () => void }>) => {
      ReactNative.useImperativeHandle(ref, () => ({ present: mockProtocolPresent, dismiss: jest.fn() }));
      return null;
    }),
  };
});
jest.mock('../../src/components/FastingHistorySheet', () => {
  const ReactNative = require('react');
  return {
    __esModule: true,
    default: ReactNative.forwardRef((_props: unknown, ref: React.Ref<{ present: () => void; dismiss: () => void }>) => {
      ReactNative.useImperativeHandle(ref, () => ({ present: mockHistoryPresent, dismiss: jest.fn() }));
      return null;
    }),
  };
});

describe('FastingCard', () => {
  beforeEach(() => {
    setTestLocale('en');
    mockCurrentFast = null;
    mockHistory = [];
    mockIsLoading = false;
    mockTimer = buildTimer();
    mockProtocolPresent.mockClear();
    mockHistoryPresent.mockClear();
  });

  it.each([
    ['en', 'Fasting'], ['pl', 'Post'],
  ] as const)('renders loading state in %s', (locale, title) => {
    setTestLocale(locale);
    mockIsLoading = true;
    const view = render(<FastingCard navigation={{ navigate: jest.fn() } as never} />);
    expect(view.getByText(title)).toBeTruthy();
    expect(view.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it.each([
    ['en', 'Fasting', 'History', 'View details', 'Catabolic', '47m to your 16 h goal', '0 h', '89%', '16 h'],
    ['pl', 'Post', 'Historia', 'Zobacz szczegóły', 'Faza kataboliczna', 'Do celu 16 godz. pozostało 47 min', '0 godz.', '89%', '16 godz.'],
  ] as const)('renders active goal card in %s', (locale, title, history, details, stage, goal, zero, percent, end) => {
    setTestLocale(locale);
    mockCurrentFast = buildFast();
    mockTimer = buildTimer({ stage: METABOLIC_STAGES[1], elapsedMs: 107 * 60000, elapsedHours: 1.78, remainingMs: 47 * 60000, progress: 0.89, remainingLabel: '47m' });
    const navigation = { navigate: jest.fn() };
    const view = render(<FastingCard navigation={navigation as never} />);
    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText(history)).toBeTruthy();
    expect(view.getByText(details)).toBeTruthy();
    expect(view.getByText(stage)).toBeTruthy();
    expect(view.getByText(goal)).toBeTruthy();
    expect(view.getByText(zero)).toBeTruthy();
    expect(view.getByText(percent)).toBeTruthy();
    expect(view.getByText(end)).toBeTruthy();
    fireEvent.press(view.getByLabelText(locale === 'en' ? 'Open fasting details' : 'Otwórz szczegóły postu'));
    expect(navigation.navigate).toHaveBeenCalledWith('FastingDetail');
  });

  it.each([
    ['en', '47m elapsed', '0 h', '16 h'],
    ['pl', 'Upłynęło 47 min', '0 godz.', '16 godz.'],
  ] as const)('renders active elapsed-only card in %s', (locale, elapsed, zero, end) => {
    setTestLocale(locale);
    mockCurrentFast = buildFast({ target_end_time: null });
    mockTimer = buildTimer({ hasGoal: false, goalHours: null, remainingMs: null, remainingLabel: null, elapsedMs: 47 * 60000 });
    const view = render(<FastingCard navigation={{ navigate: jest.fn() } as never} />);
    expect(view.getByText(elapsed)).toBeTruthy();
    expect(view.queryByText(zero)).toBeNull();
    expect(view.queryByText(end)).toBeNull();
  });

  it.each([
    ['en', 'Ready to start', 'Start fast', 'Start a fast', 'Last fast: 2h 0m · today'],
    ['pl', 'Gotowy do rozpoczęcia', 'Rozpocznij post', 'Rozpocznij post', 'Ostatni post: 2 godz. 0 min · dzisiaj'],
  ] as const)('renders idle card with today last fast in %s', (locale, ready, start, accessibility, lastFast) => {
    setTestLocale(locale);
    mockHistory = [{ ...buildFast({ status: 'COMPLETED', duration_minutes: 120, end_time: new Date().toISOString() }) }];
    const view = render(<FastingCard navigation={{ navigate: jest.fn() } as never} />);
    expect(view.getByText(ready)).toBeTruthy();
    expect(view.getByText(start)).toBeTruthy();
    expect(view.getByText(lastFast)).toBeTruthy();
    fireEvent.press(view.getByLabelText(accessibility));
    expect(mockProtocolPresent).toHaveBeenCalledWith('16-8');
    fireEvent.press(view.getByLabelText(locale === 'en' ? 'View fasting history' : 'Wyświetl historię postów'));
    expect(mockHistoryPresent).toHaveBeenCalledTimes(1);
  });

  it('selects the initial preset from history and keeps unknown server badges literal', () => {
    mockHistory = [buildFast({ status: 'COMPLETED', fasting_type: 'Custom Fast' })];
    const view = render(<FastingCard navigation={{ navigate: jest.fn() } as never} />);
    fireEvent.press(view.getByLabelText('Start a fast'));
    expect(mockProtocolPresent).toHaveBeenCalledWith('custom');
    mockCurrentFast = buildFast({ fasting_type: 'Server Special' });
    const active = render(<FastingCard navigation={{ navigate: jest.fn() } as never} />);
    expect(active.getByText('Server Special')).toBeTruthy();
  });

  it.each(METABOLIC_STAGES.map((stage) => ['pl', stage.key, stage.name] as const))(
    'does not render raw stage names in Polish for %s', (_locale, stageKey, _rawName) => {
      setTestLocale('pl');
      const stage = METABOLIC_STAGES.find((item) => item.key === stageKey)!;
      mockCurrentFast = buildFast();
      mockTimer = buildTimer({ stage });
      const view = render(<FastingCard navigation={{ navigate: jest.fn() } as never} />);
      expect(JSON.stringify(view.toJSON())).not.toContain(stage.name);
    },
  );
});
