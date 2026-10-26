import fs from 'fs';
import path from 'path';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  compareWindow,
  SUGGESTED_QUESTIONS,
  sinceStartBounds,
  todayInZone,
  type CompareQuery,
  type CompareQuestion,
  type CompareResponse,
  type CompareSinceQuery,
  type CompareSinceResponse,
  type CompareTimingChoice,
} from '@workspace/shared';
import { CompareReport } from '@/pages/Reports/Compare/CompareReport';
import { renderWithClient } from '@/tests/test-utils';

const mockGetCompare = jest.fn();
const mockGetCompareSince = jest.fn();
// When set, the page's "today"; otherwise the real day in the zone.
let mockToday: string | null = null;
let mockActingOnBehalf = false;
let mockActiveUserId = 'user-1';

// Every key the page asks for, so the last test can check en/translation.json
// says the same English.
const defaultsByKey = new Map<string, string>();

jest.mock('@workspace/shared', () => {
  const actual = jest.requireActual('@workspace/shared');
  return {
    ...actual,
    todayInZone: (tz: string) => mockToday ?? actual.todayInZone(tz),
  };
});

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('@/tests/mocks/reactI18next');
  return {
    ...actual,
    useTranslation: () => ({
      ...actual.useTranslation(),
      t: (
        key: string,
        a?: string | Record<string, unknown>,
        b?: Record<string, unknown>
      ) => {
        const def = typeof a === 'string' ? a : a?.['defaultValue'];
        const plural = typeof a === 'object' && 'defaultValue_one' in a;
        if (typeof def === 'string' && !plural) defaultsByKey.set(key, def);
        return actual.translateForTest(key, a, b);
      },
    }),
  };
});

// The real hooks run; only the network call and the signed-in user are stubbed,
// so "no request fires" is read straight off getCompare.
jest.mock('@/api/Reports/compareApi', () => ({
  ...jest.requireActual('@/api/Reports/compareApi'),
  getCompare: (q: unknown) => mockGetCompare(q),
  getCompareSince: (q: unknown) => mockGetCompareSince(q),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { activeUserId: mockActiveUserId } }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatDateInUserTimezone: (d: string) => `fmt:${d}`,
  }),
}));

// The answer card shows which response it was given, so a test can tell the
// asked timing's answer from another's.
jest.mock('@/pages/Reports/Compare/CompareAnswerCard', () => ({
  CompareAnswerCard: ({ response }: { response: CompareResponse }) => (
    <div data-testid="answer-card">{response.through}</div>
  ),
}));
jest.mock('@/pages/Reports/Compare/CompareHowSure', () => ({
  CompareHowSure: () => <div data-testid="how-sure" />,
}));
jest.mock('@/pages/Reports/Compare/CompareChecks', () => ({
  CompareChecks: () => <div data-testid="checks" />,
}));
jest.mock('@/pages/Reports/Compare/CompareDotsChart', () => ({
  CompareDotsChart: () => <div data-testid="dots-chart" />,
}));
jest.mock('@/pages/Reports/Compare/CompareOverTimeChart', () => ({
  CompareOverTimeChart: () => <div data-testid="over-time-chart" />,
}));
jest.mock('@/pages/Reports/Compare/CompareTimingTable', () => ({
  CompareTimingTable: ({
    question,
    onPickTiming,
  }: {
    question: CompareQuestion;
    onPickTiming: (choice: CompareTimingChoice) => void;
  }) => (
    <div data-testid="timing-table" data-choice={question.choice}>
      <button type="button" onClick={() => onPickTiming('nextDay')}>
        pick the next day
      </button>
    </div>
  ),
}));
jest.mock('@/pages/Reports/Compare/CompareDaysTable', () => ({
  CompareDaysTable: () => <div data-testid="days-table" />,
}));

jest.mock('@/pages/Reports/Compare/CompareSinceAnswer', () => ({
  CompareSinceAnswer: () => <div data-testid="since-answer" />,
}));
jest.mock('@/pages/Reports/Compare/CompareSinceChart', () => ({
  CompareSinceChart: () => <div data-testid="since-chart" />,
}));
jest.mock('@/pages/Reports/Compare/CompareSinceMonthTable', () => ({
  CompareSinceMonthTable: () => <div data-testid="since-month-table" />,
}));
// The real controls are tested on their own; this one shows what the page
// hands it and lets a test pick a start or a line.
jest.mock('@/pages/Reports/Compare/CompareSinceControls', () => ({
  CompareSinceControls: ({
    response,
    outcome,
    habitStart,
    line,
    onStartChange,
    onLineChange,
  }: {
    response: CompareSinceResponse | undefined;
    outcome: string;
    habitStart: string | null;
    line: number | null;
    onStartChange: (day: string) => void;
    onLineChange: (line: number) => void;
  }) => (
    <div
      data-testid="since-controls"
      data-outcome={outcome}
      data-start={habitStart ?? ''}
      data-line={line ?? ''}
      data-kept={response ? response.outcome.key : ''}
    >
      <button type="button" onClick={() => onStartChange('2026-09-01')}>
        pick a start
      </button>
      <button type="button" onClick={() => onStartChange('2024-01-01')}>
        pick an old start
      </button>
      <button type="button" onClick={() => onLineChange(7)}>
        pick a line
      </button>
    </div>
  ),
}));

const RESPONSE = {
  through: '2026-10-21',
  result: { status: 'ok' },
} as unknown as CompareResponse;

/** A response that names the timing it answers, as "timing 1". */
const byTiming = (q: CompareQuery) =>
  Promise.resolve({ ...RESPONSE, through: `timing ${q.timing}` });

const SINCE_OK = {
  mode: 'since',
  habit: { key: 'meditated' },
  outcome: { key: 'mood' },
  result: { status: 'ok' },
} as unknown as CompareSinceResponse;

beforeAll(() => {
  // Radix Select leans on these, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

describe('CompareReport', () => {
  beforeEach(() => {
    mockActingOnBehalf = false;
    mockActiveUserId = 'user-1';
    window.localStorage.clear();
    mockGetCompare.mockReset();
    mockGetCompare.mockResolvedValue(RESPONSE);
    mockGetCompareSince.mockReset();
    mockGetCompareSince.mockResolvedValue(SINCE_OK);
    mockToday = null;
  });

  const first = SUGGESTED_QUESTIONS[0]!;
  const suggestionId = `compare-suggestion-${first.a}-${first.b}-${first.choice}`;

  const asked = (): CompareQuery[] =>
    mockGetCompare.mock.calls.map(([q]) => q as CompareQuery);

  const pickTiming = (name: string) => {
    fireEvent.keyDown(screen.getByRole('combobox', { name: /When/ }), {
      key: 'Enter',
    });
    fireEvent.click(screen.getByRole('option', { name }));
  };

  const pressed = (name: string) =>
    screen.getByRole('button', { name }).getAttribute('aria-pressed');

  it('shows suggested questions and asks nothing before a question is picked', () => {
    renderWithClient(<CompareReport />);
    expect(screen.getByTestId(suggestionId)).toBeInTheDocument();
    expect(mockGetCompare).not.toHaveBeenCalled();
    expect(screen.queryByTestId('answer-card')).not.toBeInTheDocument();
  });

  it('renders the answer column, both charts and both tables for a picked question', async () => {
    renderWithClient(<CompareReport />);
    fireEvent.click(screen.getByTestId(suggestionId));
    for (const id of [
      'answer-card',
      'how-sure',
      'checks',
      'dots-chart',
      'over-time-chart',
      'timing-table',
      'days-table',
    ]) {
      expect(await screen.findByTestId(id)).toBeInTheDocument();
    }
    expect(mockGetCompare).toHaveBeenCalledWith(
      expect.objectContaining({ a: first.a, b: first.b })
    );
    // The first answer is kept as a recent question, under this account.
    expect(
      window.localStorage.getItem('sparky.compareRecentQuestions.v1.user-1')
    ).toContain(first.choice);
  });

  it('shows only-your-own-data and sends no request when acting on behalf', () => {
    mockActingOnBehalf = true;
    renderWithClient(<CompareReport />);
    expect(
      screen.getByText('Compare shows only your own data')
    ).toBeInTheDocument();
    expect(mockGetCompare).not.toHaveBeenCalled();
  });

  it('a day/week change starts the span over at the default and drops a custom range', async () => {
    const today = todayInZone('UTC');
    renderWithClient(<CompareReport />);
    fireEvent.click(screen.getByTestId(suggestionId));
    await screen.findByTestId('answer-card');
    expect(pressed('90 days')).toBe('true');

    // By day: 30 days, then a custom range.
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(pressed('Custom')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Start date' })
    ).toBeInTheDocument();

    // By week: the week default, no custom range, and the query asks for it.
    pickTiming('The same week');
    expect(pressed('6 months')).toBe('true');
    expect(pressed('Custom')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Start date' })).toBeNull();
    await screen.findByTestId('answer-card');
    const week = compareWindow('6m', 'week', today);
    expect(asked()).toContainEqual(
      expect.objectContaining({
        mode: 'week',
        timing: 0,
        start: week.startDate,
        end: week.endDate,
      })
    );

    // Back to day: the day default again, never a 6-month span by day.
    pickTiming('The next day');
    expect(pressed('90 days')).toBe('true');
    await screen.findByTestId('answer-card');
    const day = compareWindow('90d', 'day', today);
    expect(asked()).toContainEqual(
      expect.objectContaining({
        mode: 'day',
        timing: 1,
        start: day.startDate,
        end: day.endDate,
      })
    );
    // No week was ever asked over a day span, and no day over a week span.
    expect(
      asked().filter((q) => q.mode === 'week' && q.start !== week.startDate)
    ).toEqual([]);
    expect(
      asked().filter((q) => q.mode === 'day' && q.start === week.startDate)
    ).toEqual([]);
  });

  it('a trip through since mode keeps the day span', async () => {
    renderWithClient(<CompareReport />);
    fireEvent.click(
      screen.getByTestId('compare-suggestion-meditated-mood-sameDay')
    );
    await screen.findByTestId('answer-card');
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));

    pickTiming('Before vs. since');
    await screen.findByTestId('since-answer');
    expect(screen.queryByRole('button', { name: '30 days' })).toBeNull();

    // Back to day: still 30 days, not the day default.
    pickTiming('The next day');
    expect(pressed('30 days')).toBe('true');
    expect(pressed('90 days')).toBe('false');
    await screen.findByTestId('answer-card');

    // Day to week still starts the span over.
    pickTiming('The same week');
    expect(pressed('6 months')).toBe('true');
  });

  it('a timing-row pick switches the question and shows the answer for that timing', async () => {
    mockGetCompare.mockImplementation(byTiming);
    renderWithClient(<CompareReport />);
    fireEvent.click(screen.getByTestId(suggestionId));
    expect(await screen.findByText('timing 0')).toBeInTheDocument();
    expect(screen.getByTestId('timing-table')).toHaveAttribute(
      'data-choice',
      'sameDay'
    );

    fireEvent.click(screen.getByRole('button', { name: 'pick the next day' }));
    expect(screen.getByTestId('timing-table')).toHaveAttribute(
      'data-choice',
      'nextDay'
    );
    expect(await screen.findByText('timing 1')).toBeInTheDocument();
    expect(mockGetCompare).toHaveBeenCalledWith(
      expect.objectContaining({ a: first.a, b: first.b, timing: 1 })
    );
  });

  it('a failed refresh keeps the answer on screen with no error line', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    render(<CompareReport />, { wrapper });
    fireEvent.click(screen.getByTestId(suggestionId));
    await screen.findByTestId('answer-card');

    mockGetCompare.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await client.refetchQueries();
    });
    expect(screen.getByTestId('answer-card')).toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't load this comparison")
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('a failed first load says so and Retry asks again', async () => {
    mockGetCompare.mockRejectedValue(new Error('offline'));
    renderWithClient(<CompareReport />);
    fireEvent.click(screen.getByTestId(suggestionId));
    expect(
      await screen.findByText("Couldn't load this comparison")
    ).toBeInTheDocument();
    expect(screen.queryByTestId('answer-card')).not.toBeInTheDocument();

    const callsBefore = mockGetCompare.mock.calls.length;
    mockGetCompare.mockResolvedValue(RESPONSE);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('answer-card')).toBeInTheDocument();
    expect(mockGetCompare.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(
      screen.queryByText("Couldn't load this comparison")
    ).not.toBeInTheDocument();
  });

  describe('since mode', () => {
    const SINCE_RECENT = { a: 'meditated', b: 'mood', choice: 'sinceHabit' };
    const recentId = 'compare-recent-meditated-mood-sinceHabit';

    const askedSince = (): CompareSinceQuery[] =>
      mockGetCompareSince.mock.calls.map(([q]) => q as CompareSinceQuery);

    const startSince = async () => {
      window.localStorage.setItem(
        'sparky.compareRecentQuestions.v1.user-1',
        JSON.stringify([SINCE_RECENT])
      );
      renderWithClient(<CompareReport />);
      fireEvent.click(screen.getByTestId(recentId));
      await screen.findByTestId('since-answer');
    };

    test('Before vs. since asks mode=since with no start or line', async () => {
      await startSince();
      expect(askedSince()).toEqual([
        { a: 'meditated', b: 'mood', mode: 'since' },
      ]);
      expect(mockGetCompare).not.toHaveBeenCalled();
      for (const id of ['since-controls', 'since-chart', 'since-month-table']) {
        expect(screen.getByTestId(id)).toBeInTheDocument();
      }
      // Day and week sections and the span control do not apply.
      expect(screen.queryByRole('button', { name: '90 days' })).toBeNull();
      expect(screen.queryByTestId('answer-card')).toBeNull();
      expect(screen.queryByTestId('timing-table')).toBeNull();
      expect(screen.queryByTestId('days-table')).toBeNull();
    });

    test('picking a start sends habitStart; picking a new habit drops it', async () => {
      await startSince();
      fireEvent.click(screen.getByRole('button', { name: 'pick a start' }));
      await waitFor(() =>
        expect(askedSince()).toContainEqual({
          a: 'meditated',
          b: 'mood',
          mode: 'since',
          habitStart: '2026-09-01',
        })
      );
      expect(screen.getByTestId('since-controls')).toHaveAttribute(
        'data-start',
        '2026-09-01'
      );

      fireEvent.keyDown(screen.getByRole('combobox', { name: /First thing/ }), {
        key: 'Enter',
      });
      fireEvent.click(screen.getByRole('option', { name: 'Caffeine' }));
      await waitFor(() =>
        expect(askedSince()).toContainEqual({
          a: 'caffeine',
          b: 'mood',
          mode: 'since',
        })
      );
      expect(screen.getByTestId('since-controls')).toHaveAttribute(
        'data-start',
        ''
      );
    });

    test('a picked line belongs to its outcome', async () => {
      await startSince();
      fireEvent.click(screen.getByRole('button', { name: 'pick a line' }));
      await waitFor(() =>
        expect(askedSince()).toContainEqual({
          a: 'meditated',
          b: 'mood',
          mode: 'since',
          line: 7,
        })
      );
      expect(screen.getByTestId('since-controls')).toHaveAttribute(
        'data-line',
        '7'
      );

      fireEvent.keyDown(
        screen.getByRole('combobox', { name: /Second thing/ }),
        { key: 'Enter' }
      );
      fireEvent.click(screen.getByRole('option', { name: 'Energy' }));
      await waitFor(() =>
        expect(askedSince()).toContainEqual({
          a: 'meditated',
          b: 'energy',
          mode: 'since',
        })
      );
      expect(screen.getByTestId('since-controls')).toHaveAttribute(
        'data-line',
        ''
      );
    });

    test('a start older than 730 days is clamped before it is sent', async () => {
      mockToday = '2026-10-23';
      await startSince();
      fireEvent.click(screen.getByRole('button', { name: 'pick a start' }));
      await waitFor(() =>
        expect(screen.getByTestId('since-controls')).toHaveAttribute(
          'data-start',
          '2026-09-01'
        )
      );

      // A year and more later, the picked day is past the two-year limit.
      mockToday = '2028-10-23';
      fireEvent.click(screen.getByRole('button', { name: 'pick a line' }));
      const { min } = sinceStartBounds('2028-10-23');
      await waitFor(() =>
        expect(askedSince()).toContainEqual({
          a: 'meditated',
          b: 'mood',
          mode: 'since',
          habitStart: min,
          line: 7,
        })
      );
      expect(min > '2026-09-01').toBe(true);
      expect(
        askedSince().filter(
          (q) =>
            q.habitStart !== undefined && q.habitStart < min && q.line === 7
        )
      ).toEqual([]);
    });

    test('keeps the last answer for the controls while a new start loads', async () => {
      await startSince();
      mockGetCompareSince.mockReturnValue(new Promise(() => undefined));
      fireEvent.click(screen.getByRole('button', { name: 'pick a start' }));
      await waitFor(() => expect(askedSince()).toHaveLength(2));
      expect(screen.getByTestId('since-controls')).toHaveAttribute(
        'data-kept',
        'mood'
      );
    });

    test('a failed first load says so and Retry asks again', async () => {
      mockGetCompareSince.mockRejectedValue(new Error('offline'));
      window.localStorage.setItem(
        'sparky.compareRecentQuestions.v1.user-1',
        JSON.stringify([SINCE_RECENT])
      );
      renderWithClient(<CompareReport />);
      fireEvent.click(screen.getByTestId(recentId));
      expect(
        await screen.findByText("Couldn't load this comparison")
      ).toBeInTheDocument();
      mockGetCompareSince.mockResolvedValue(SINCE_OK);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByTestId('since-answer')).toBeInTheDocument();
    });

    test('the month table shows only when the answer is ok', async () => {
      mockGetCompareSince.mockResolvedValue({
        ...SINCE_OK,
        result: {
          status: 'not_enough',
          reason: 'fewSince',
          start: '2026-09-01',
          suggestedStart: '2026-09-01',
          line: 70,
        },
      });
      await startSince();
      expect(screen.getByTestId('since-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('since-month-table')).toBeNull();
    });

    test('an answered since question is saved as a recent', async () => {
      await startSince();
      await waitFor(() =>
        expect(
          window.localStorage.getItem('sparky.compareRecentQuestions.v1.user-1')
        ).toContain('sinceHabit')
      );
    });

    test('acting on behalf sends no since request', async () => {
      window.localStorage.setItem(
        'sparky.compareRecentQuestions.v1.user-1',
        JSON.stringify([SINCE_RECENT])
      );
      const { rerender } = renderWithClient(<CompareReport />);
      fireEvent.click(screen.getByTestId(recentId));
      await screen.findByTestId('since-answer');
      const callsBefore = mockGetCompareSince.mock.calls.length;
      expect(callsBefore).toBeGreaterThan(0);

      // Acting on behalf switches the active user, which would key a new
      // since request for the same question if the page still asked.
      mockActingOnBehalf = true;
      mockActiveUserId = 'user-2';
      rerender(<CompareReport />);
      expect(
        screen.getByText('Compare shows only your own data')
      ).toBeInTheDocument();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(mockGetCompareSince.mock.calls.length).toBe(callsBefore);
    });

    test('the start state lists a recent since question', () => {
      window.localStorage.setItem(
        'sparky.compareRecentQuestions.v1.user-1',
        JSON.stringify([SINCE_RECENT])
      );
      renderWithClient(<CompareReport />);
      expect(screen.getByTestId(recentId)).toBeInTheDocument();
      expect(screen.getByTestId(recentId)).toHaveTextContent(/since/i);
    });
  });
});

// Runs last, so it sees every key the tests above asked for.
describe('en/translation.json', () => {
  it('says the same English as every default the page passes', () => {
    const json: unknown = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), 'public/locales/en/translation.json'),
        'utf-8'
      )
    );
    const leaf = (key: string): unknown =>
      key
        .split('.')
        .reduce<unknown>(
          (node, part) =>
            typeof node === 'object' && node !== null
              ? (node as Record<string, unknown>)[part]
              : undefined,
          json
        );
    expect(defaultsByKey.get('compareReport.screen.retry')).toBe('Retry');
    const mismatches = [...defaultsByKey]
      .filter(([key]) => key.startsWith('compareReport.'))
      .filter(([key, def]) => leaf(key) !== def)
      .map(([key, def]) => `${key}: ${String(leaf(key))} != ${def}`);
    expect(mismatches).toEqual([]);
  });
});
