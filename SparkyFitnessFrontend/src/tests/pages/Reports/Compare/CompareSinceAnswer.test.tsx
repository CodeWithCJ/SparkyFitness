import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type {
  CompareMetricKey,
  CompareSinceResponse,
  CompareSinceResult,
} from '@workspace/shared';
import { CompareSinceAnswer } from '@/pages/Reports/Compare/CompareSinceAnswer';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    timeFormat: 'HH:mm',
    formatDateInUserTimezone: (d: string) => d,
  }),
}));

const OK: CompareSinceResult = {
  status: 'ok',
  start: '2026-04-01',
  suggestedStart: '2026-04-01',
  before: {
    from: '2025-10-08',
    to: '2026-03-31',
    days: 175,
    valueDays: 160,
    mean: 58,
    p10: 40,
    p90: 70,
    shareAtOrAbove: 0.38,
  },
  since: {
    from: '2026-04-01',
    to: '2026-10-20',
    days: 203,
    valueDays: 190,
    mean: 66,
    p10: 50,
    p90: 80,
    shareAtOrAbove: 0.64,
  },
  line: 70,
  diff: 8,
  low: 3,
  high: 13,
  p: 0.004,
  changed: true,
  regularity: { weeksKept: 24, weeks: 28 },
  alreadyChanging: false,
};

function response(
  result: Partial<CompareSinceResult>,
  outcome: CompareMetricKey = 'mood'
): CompareSinceResponse {
  return {
    mode: 'since',
    habit: { key: 'meditated', values: {} },
    outcome: { key: outcome, values: {} },
    result: { ...OK, ...result },
  };
}

const CAVEAT =
  'A lot can change over months; this shows a change since you started, not that meditating caused it.';

describe('CompareSinceAnswer', () => {
  test('every since answer ends with the caveat', () => {
    const answers: CompareSinceResponse[] = [
      response({}),
      response({
        status: 'not_enough',
        reason: 'fewSince',
        diff: undefined,
        low: undefined,
        high: undefined,
        p: undefined,
        changed: undefined,
        regularity: undefined,
        alreadyChanging: undefined,
      }),
      response({ status: 'not_enough', reason: 'noStart', start: null }),
    ];
    for (const answer of answers) {
      const { unmount } = render(<CompareSinceAnswer response={answer} />);
      expect(screen.getByText(CAVEAT)).toBeInTheDocument();
      unmount();
    }
  });

  test('an ok answer shows the table, kept-up line and how sure; not_enough shows none of them', () => {
    const { unmount } = render(<CompareSinceAnswer response={response({})} />);
    expect(screen.getByText('Before and since')).toBeInTheDocument();
    expect(screen.getByText('Usually between')).toBeInTheDocument();
    expect(screen.getByText('At or above 7.0')).toBeInTheDocument();
    expect(screen.getByText('5.8')).toBeInTheDocument();
    expect(screen.getByText('6.6')).toBeInTheDocument();
    expect(
      screen.getByText('You kept it up in 24 of 28 weeks since.')
    ).toBeInTheDocument();
    expect(screen.getByText('How sure is this?')).toBeInTheDocument();
    unmount();

    render(
      <CompareSinceAnswer
        response={response({
          status: 'not_enough',
          reason: 'fewSince',
          diff: undefined,
          low: undefined,
          high: undefined,
          p: undefined,
          changed: undefined,
          regularity: undefined,
          alreadyChanging: undefined,
        })}
      />
    );
    expect(screen.queryByText('Before and since')).not.toBeInTheDocument();
    expect(screen.queryByText(/You kept it up/)).not.toBeInTheDocument();
    expect(screen.queryByText('How sure is this?')).not.toBeInTheDocument();
  });

  test("the table's row-label column is named for screen readers", () => {
    render(<CompareSinceAnswer response={response({})} />);
    expect(
      screen.getByRole('columnheader', { name: 'Stretch' })
    ).toBeInTheDocument();
  });

  test('a yes/no outcome table has no usual or line column', () => {
    render(
      <CompareSinceAnswer
        response={response(
          {
            before: {
              ...OK.before!,
              mean: 0.3,
              p10: undefined,
              p90: undefined,
              shareAtOrAbove: undefined,
            },
            since: {
              ...OK.since!,
              mean: 0.5,
              p10: undefined,
              p90: undefined,
              shareAtOrAbove: undefined,
            },
          },
          'meditated'
        )}
      />
    );
    expect(screen.getByText('Average')).toBeInTheDocument();
    expect(screen.queryByText('Usually between')).not.toBeInTheDocument();
    expect(screen.queryByText(/At or above/)).not.toBeInTheDocument();
  });

  test('the answer column is one element, so the page grid keeps the chart beside it', () => {
    const { container } = render(
      <CompareSinceAnswer response={response({})} />
    );
    expect(container.childElementCount).toBe(1);
    expect(container.firstElementChild).toHaveClass('space-y-6');
    expect(container.firstElementChild).toHaveTextContent('Yes, it changed');
    expect(container.firstElementChild).toHaveTextContent('Before and since');
    expect(container.firstElementChild).toHaveTextContent('How sure is this?');
  });

  test('a bedtime verdict follows the 12/24-hour setting', () => {
    render(
      <CompareSinceAnswer
        response={response(
          {
            before: { ...OK.before!, mean: 330 },
            since: { ...OK.since!, mean: 300 },
            diff: -30,
            line: 300,
          },
          'bedtime'
        )}
      />
    );
    expect(
      screen.getByText(
        'Since 2026-04-01, your bedtime averaged 23:00 vs 23:30 before (30 min earlier).'
      )
    ).toBeInTheDocument();
  });

  test('the already-changing warning shows only when the server flags it', () => {
    const { unmount } = render(
      <CompareSinceAnswer response={response({ alreadyChanging: false })} />
    );
    expect(screen.queryByText(/was already/)).not.toBeInTheDocument();
    unmount();

    render(
      <CompareSinceAnswer response={response({ alreadyChanging: true })} />
    );
    expect(
      screen.getByText('⚠ Mood was already rising before you started.')
    ).toBeInTheDocument();
  });
});
