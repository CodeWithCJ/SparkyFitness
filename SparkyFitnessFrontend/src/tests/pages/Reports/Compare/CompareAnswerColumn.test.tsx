import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type {
  CompareQuestion,
  CompareResponse,
  CompareResult,
} from '@workspace/shared';
import { CompareAnswerCard } from '@/pages/Reports/Compare/CompareAnswerCard';
import { CompareChecks } from '@/pages/Reports/Compare/CompareChecks';
import { CompareHowSure } from '@/pages/Reports/Compare/CompareHowSure';
import { howSureLines } from '@/pages/Reports/Compare/compareCopy';
import { translateForTest } from '@/tests/mocks/reactI18next';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatDateInUserTimezone: (d: string) => `fmt:${d}`,
  }),
}));

jest.mock('@workspace/shared', () => ({
  ...jest.requireActual('@workspace/shared'),
  todayInZone: () => '2026-10-22',
}));

const Q: CompareQuestion = { a: 'timeAsleep', b: 'energy', choice: 'sameDay' };

function response(
  result: Partial<CompareResult>,
  through = '2026-10-21',
  q: CompareQuestion = Q
): CompareResponse {
  return {
    a: { key: q.a, values: {} },
    b: { key: q.b, values: {} },
    through,
    deviations: { a: {}, b: {} },
    result: {
      status: 'ok',
      n: 62,
      needed: 14,
      checks: { ownNormal: true },
      ...result,
    },
  };
}

const LINKED = response({
  linked: true,
  sign: 'positive',
  strength: 'moderate',
  r: 0.4,
  p: 0.02,
  low: 0.1,
  high: 0.6,
  checks: { ownNormal: true, direction: 'firstComesFirst' },
});
const UNLINKED = response({
  linked: false,
  r: 0.02,
  p: 0.6,
  low: -0.2,
  high: 0.25,
  checks: { ownNormal: true, direction: 'firstComesFirst' },
});
const NOT_ENOUGH = response({ status: 'not_enough', n: 3 });

describe('CompareAnswerCard', () => {
  test.each([
    ['linked', LINKED],
    ['unlinked', UNLINKED],
    ['not enough', NOT_ENOUGH],
  ])('shows a headline for the %s answer', (_name, r) => {
    render(<CompareAnswerCard response={r} question={Q} span="90d" />);
    expect(screen.getByRole('heading').textContent?.length).toBeGreaterThan(0);
  });

  test('says through yesterday', () => {
    render(<CompareAnswerCard response={LINKED} question={Q} span="90d" />);
    expect(screen.getByText('Through yesterday')).toBeInTheDocument();
  });

  test('says through last week in week mode', () => {
    render(
      <CompareAnswerCard
        response={response({ linked: false }, '2026-10-18')}
        question={{ ...Q, choice: 'sameWeek' }}
        span="90d"
      />
    );
    expect(screen.getByText('Through last week')).toBeInTheDocument();
  });

  test('otherwise names the date', () => {
    render(
      <CompareAnswerCard
        response={response({ linked: false }, '2026-09-01')}
        question={Q}
        span="90d"
      />
    );
    expect(screen.getByText('Through fmt:2026-09-01')).toBeInTheDocument();
  });
});

describe('CompareHowSure', () => {
  test('words p = 0.02 as about 1 time in 50', () => {
    render(
      <CompareHowSure
        lines={howSureLines(LINKED.result, Q, translateForTest)}
      />
    );
    expect(screen.getByText(/about 1 time in 50/)).toBeInTheDocument();
  });

  test('is empty without an answer', () => {
    const { container } = render(
      <CompareHowSure
        lines={howSureLines(NOT_ENOUGH.result, Q, translateForTest)}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('CompareChecks', () => {
  test('lists the direction line only for a link', () => {
    const { unmount } = render(
      <CompareChecks response={LINKED} question={Q} />
    );
    expect(screen.getByText(/seems to come first|comes first/)).toBeVisible();
    unmount();
    render(<CompareChecks response={UNLINKED} question={Q} />);
    expect(screen.getByText(/Compared with your own normal/)).toBeVisible();
    expect(screen.queryByText(/comes first/)).not.toBeInTheDocument();
  });
});
