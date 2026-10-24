import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type {
  CompareMetricKey,
  CompareQuestion,
  CompareResponse,
  CompareSinceResponse,
} from '@workspace/shared';
import { CompareSinceMonthTable } from '@/pages/Reports/Compare/CompareSinceMonthTable';
import { CompareDaysTable } from '@/pages/Reports/Compare/CompareDaysTable';
import { CompareTimingTable } from '@/pages/Reports/Compare/CompareTimingTable';
import type { CompareTimingRow } from '@/pages/Reports/Compare/compareTables';

// Every key the sections ask for, so the last test can check
// en/translation.json says the same English.
const defaultsByKey = new Map<string, string>();
const pluralByKey = new Map<string, { one: string; other: string }>();

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
        if (typeof def === 'string') defaultsByKey.set(key, def);
        const one = typeof a === 'object' ? a['defaultValue_one'] : undefined;
        const other =
          typeof a === 'object' ? a['defaultValue_other'] : undefined;
        if (typeof one === 'string' && typeof other === 'string')
          pluralByKey.set(key, { one, other });
        return actual.translateForTest(key, a, b);
      },
    }),
  };
});

let mockTimeFormat: string | undefined;

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    timeFormat: mockTimeFormat,
    formatDateInUserTimezone: (d: string) => `fmt:${d}`,
  }),
}));

beforeEach(() => {
  mockTimeFormat = undefined;
});

const DAY_Q: CompareQuestion = {
  a: 'focus',
  b: 'energy',
  choice: 'nextDay',
};

function row(
  choice: CompareTimingRow['choice'],
  timing: CompareTimingRow['timing'],
  over: Partial<CompareTimingRow> = {}
): CompareTimingRow {
  return {
    choice,
    timing,
    status: 'ok',
    strength: 0.4,
    method: 'pearson',
    linked: true,
    isAsked: false,
    ...over,
  };
}

const DAY_ROWS: CompareTimingRow[] = [
  row('dayBefore', -1, { strength: 0.1, linked: false }),
  row('sameDay', 0, { strength: 0.2, linked: false }),
  row('nextDay', 1, { isAsked: true, strength: 0.42 }),
];

describe('CompareTimingTable', () => {
  test('three rows by day, the asked one tagged, with the footnote', () => {
    render(
      <CompareTimingTable
        question={DAY_Q}
        rows={DAY_ROWS}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getByText('Does timing matter?')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('Energy the day before')).toBeInTheDocument();
    expect(screen.getByText('Energy the next day')).toBeInTheDocument();
    expect(screen.getAllByText('Your question')).toHaveLength(1);
    expect(screen.getByText('+0.42')).toBeInTheDocument();
    expect(screen.getByText('Linked')).toBeInTheDocument();
    expect(screen.getAllByText('No clear link')).toHaveLength(2);
    expect(
      screen.getByText(
        "Looking at several timings makes one 'yes' by chance more likely. Trust the timing you meant to ask about."
      )
    ).toBeInTheDocument();
  });

  test('two rows by week', () => {
    render(
      <CompareTimingTable
        question={{ ...DAY_Q, choice: 'sameWeek' }}
        rows={[
          row('sameWeek', 0, { isAsked: true }),
          row('nextWeek', 1, { linked: false }),
        ]}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('Energy the same week')).toBeInTheDocument();
  });

  test('clicking another timing picks it; the asked row does nothing', () => {
    const onPickTiming = jest.fn();
    render(
      <CompareTimingTable
        question={{ ...DAY_Q, choice: 'sameDay' }}
        rows={[
          row('dayBefore', -1),
          row('sameDay', 0, { isAsked: true }),
          row('nextDay', 1),
        ]}
        onPickTiming={onPickTiming}
      />
    );
    fireEvent.click(screen.getByText('Energy the next day'));
    expect(onPickTiming).toHaveBeenCalledWith('nextDay');
    fireEvent.click(screen.getByText('Energy the same day'));
    expect(onPickTiming).toHaveBeenCalledTimes(1);
  });

  test('a failed timing says so while the asked row keeps its strength', () => {
    render(
      <CompareTimingTable
        question={DAY_Q}
        rows={[
          row('dayBefore', -1, {
            status: 'error',
            strength: null,
            method: null,
            linked: false,
          }),
          row('sameDay', 0, {
            status: 'not_enough',
            strength: null,
            method: null,
            linked: false,
          }),
          row('nextDay', 1, { isAsked: true, strength: 0.42 }),
        ]}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getByText("Couldn't load")).toBeInTheDocument();
    expect(screen.getByText('Not enough days')).toBeInTheDocument();
    expect(screen.getByText('+0.42')).toBeInTheDocument();
  });

  test('a week timing short of data says weeks, not days', () => {
    render(
      <CompareTimingTable
        question={{ ...DAY_Q, choice: 'sameWeek' }}
        rows={[
          row('sameWeek', 0, { isAsked: true, strength: 0.42 }),
          row('nextWeek', 1, {
            status: 'not_enough',
            strength: null,
            method: null,
            linked: false,
          }),
        ]}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getByText('Not enough weeks')).toBeInTheDocument();
    expect(screen.queryByText('Not enough days')).not.toBeInTheDocument();
  });

  test('a loading timing shows a spinner', () => {
    render(
      <CompareTimingTable
        question={DAY_Q}
        rows={[
          row('dayBefore', -1, {
            status: 'loading',
            strength: null,
            method: null,
            linked: false,
          }),
          row('sameDay', 0),
          row('nextDay', 1, { isAsked: true }),
        ]}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('a yes/no difference shows its gap on the outcome scale', () => {
    render(
      <CompareTimingTable
        question={{ a: 'meditated', b: 'mood', choice: 'sameDay' }}
        rows={[
          row('dayBefore', -1, { method: 'difference', strength: 0.5 }),
          row('sameDay', 0, {
            isAsked: true,
            method: 'difference',
            strength: -1.25,
          }),
          row('nextDay', 1, { method: 'difference', strength: 0 }),
        ]}
        onPickTiming={jest.fn()}
      />
    );
    expect(screen.getByText('+0.5')).toBeInTheDocument();
    expect(screen.getByText('-1.3')).toBeInTheDocument();
  });
});

function response(
  q: CompareQuestion,
  parts: {
    aValues: Record<string, number>;
    bValues: Record<string, number>;
    devA: Record<string, number>;
    devB: Record<string, number>;
  }
): CompareResponse {
  return {
    a: { key: q.a, values: parts.aValues },
    b: { key: q.b, values: parts.bValues },
    through: '2026-10-21',
    deviations: { a: parts.devA, b: parts.devB },
    result: {
      status: 'ok',
      n: 2,
      needed: 14,
      checks: { ownNormal: true },
    },
  };
}

function bodyRows(): HTMLElement[] {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

describe('CompareDaysTable', () => {
  test('shows mood on 1-10 and bedtime as a clock time, newest first', () => {
    const q: CompareQuestion = { a: 'bedtime', b: 'mood', choice: 'nextDay' };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-01': 240, '2026-10-02': 300 },
          bValues: { '2026-10-02': 70, '2026-10-03': 55 },
          devA: { '2026-10-01': 30, '2026-10-02': -30 },
          devB: { '2026-10-02': 10, '2026-10-03': -15 },
        })}
      />
    );
    const rows = bodyRows();
    expect(rows).toHaveLength(2);
    // Newest first.
    expect(within(rows[0]!).getByText('fmt:2026-10-02')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('fmt:2026-10-01')).toBeInTheDocument();
    // Stored mood 70 reads 7.0; the 18:00 + 240 minutes bedtime is 10:00 PM.
    expect(within(rows[1]!).getByText('7.0')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/10:00/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText('+1.0')).toBeInTheDocument();
    // A bedtime deviation is a span of minutes.
    expect(within(rows[1]!).getByText('+30 min')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('-30 min')).toBeInTheDocument();
    // Headers carry the timing words on B, and a sleep A by day is last night's.
    const table = within(screen.getByRole('table'));
    expect(
      table.getByText('Mood (the day after you woke)')
    ).toBeInTheDocument();
    expect(
      table.getByText('Mood (the day after you woke) vs. your usual')
    ).toBeInTheDocument();
    expect(table.getByText("Last night's bedtime")).toBeInTheDocument();
    expect(
      table.getByText("Last night's bedtime vs. your usual")
    ).toBeInTheDocument();
  });

  test('bedtime follows the 12/24-hour setting', () => {
    const q: CompareQuestion = { a: 'bedtime', b: 'mood', choice: 'nextDay' };
    const parts = {
      aValues: { '2026-10-01': 240 },
      bValues: { '2026-10-02': 70 },
      devA: { '2026-10-01': 30 },
      devB: { '2026-10-02': 10 },
    };
    mockTimeFormat = 'HH:mm';
    const { unmount } = render(
      <CompareDaysTable question={q} response={response(q, parts)} />
    );
    expect(within(bodyRows()[0]!).getByText('22:00')).toBeInTheDocument();
    unmount();
    mockTimeFormat = 'h:mm A';
    render(<CompareDaysTable question={q} response={response(q, parts)} />);
    expect(within(bodyRows()[0]!).getByText('10:00 PM')).toBeInTheDocument();
  });

  test('sleep on B the same day is the night before', () => {
    const q: CompareQuestion = {
      a: 'caffeine',
      b: 'timeAsleep',
      choice: 'sameDay',
    };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-01': 200 },
          bValues: { '2026-10-01': 7.1 },
          devA: { '2026-10-01': 50 },
          devB: { '2026-10-01': -0.4 },
        })}
      />
    );
    const table = within(screen.getByRole('table'));
    expect(
      table.getByText('Time asleep (the night before)')
    ).toBeInTheDocument();
    expect(
      table.getByText('Time asleep (the night before) vs. your usual')
    ).toBeInTheDocument();
    expect(table.getByText('Caffeine')).toBeInTheDocument();
  });

  test("sleep on A the same day is last night's, and B is that day", () => {
    const q: CompareQuestion = {
      a: 'timeAsleep',
      b: 'energy',
      choice: 'sameDay',
    };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-01': 7.1 },
          bValues: { '2026-10-01': 3 },
          devA: { '2026-10-01': -0.4 },
          devB: { '2026-10-01': 0.5 },
        })}
      />
    );
    const table = within(screen.getByRole('table'));
    expect(table.getByText("Last night's time asleep")).toBeInTheDocument();
    expect(table.getByText('Energy (that day)')).toBeInTheDocument();
  });

  test('two sleep metrics the same day share the same night', () => {
    const q: CompareQuestion = {
      a: 'timeAsleep',
      b: 'sleepScore',
      choice: 'sameDay',
    };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-01': 7.1 },
          bValues: { '2026-10-01': 80 },
          devA: { '2026-10-01': -0.4 },
          devB: { '2026-10-01': 2 },
        })}
      />
    );
    expect(
      within(screen.getByRole('table')).getByText(
        'Sleep score (the same night)'
      )
    ).toBeInTheDocument();
  });

  test('a yes/no side by day shows Yes/No and has no vs-usual column', () => {
    const q: CompareQuestion = {
      a: 'meditated',
      b: 'energy',
      choice: 'sameDay',
    };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-01': 1, '2026-10-02': 0 },
          bValues: { '2026-10-01': 4, '2026-10-02': 3 },
          devA: { '2026-10-01': 1, '2026-10-02': 0 },
          devB: { '2026-10-01': 1, '2026-10-02': -0.5 },
        })}
      />
    );
    const rows = bodyRows();
    expect(within(rows[0]!).getByText('No')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Yes')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('—')).not.toBeInTheDocument();
    expect(within(rows[0]!).getByText('-0.5')).toBeInTheDocument();
    // Day, Meditating, Energy, Energy vs. your usual. Neither side is sleep and
    // the timing is the same day, so B carries no timing words.
    const table = within(screen.getByRole('table'));
    expect(table.getAllByRole('columnheader')).toHaveLength(4);
    expect(table.queryByText('Meditating vs. your usual')).toBeNull();
    expect(table.getByText('Energy')).toBeInTheDocument();
    expect(table.getByText('Energy vs. your usual')).toBeInTheDocument();
  });

  test('a yes/no side by week is a day count with a signed deviation', () => {
    const q: CompareQuestion = {
      a: 'meditated',
      b: 'energy',
      choice: 'sameWeek',
    };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-05': 3, '2026-10-12': 1 },
          bValues: { '2026-10-05': 4, '2026-10-12': 3 },
          devA: { '2026-10-05': 1.5, '2026-10-12': -1 },
          devB: { '2026-10-05': 0.5, '2026-10-12': -0.5 },
        })}
      />
    );
    const rows = bodyRows();
    expect(within(rows[0]!).getByText('1 day')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('-1.0 days')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('3 days')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('+1.5 days')).toBeInTheDocument();
    expect(within(rows[1]!).queryByText('Yes')).not.toBeInTheDocument();
    // By week the habit keeps its vs-usual column.
    expect(
      within(screen.getByRole('table')).getAllByRole('columnheader')
    ).toHaveLength(5);
  });

  test('by week the day column reads "Week of"', () => {
    const q: CompareQuestion = {
      a: 'timeAsleep',
      b: 'energy',
      choice: 'sameWeek',
    };
    render(
      <CompareDaysTable
        question={q}
        response={response(q, {
          aValues: { '2026-10-05': 420 },
          bValues: { '2026-10-05': 3 },
          devA: { '2026-10-05': 10 },
          devB: { '2026-10-05': 0.5 },
        })}
      />
    );
    expect(
      within(screen.getByRole('table')).getByText('Week of fmt:2026-10-05')
    ).toBeInTheDocument();
  });
});

function sinceResponse(
  habit: CompareMetricKey,
  outcome: CompareMetricKey,
  habitValues: Record<string, number>,
  outcomeValues: Record<string, number>
): CompareSinceResponse {
  return {
    mode: 'since',
    habit: { key: habit, values: habitValues },
    outcome: { key: outcome, values: outcomeValues },
    result: {
      status: 'ok',
      start: '2026-06-17',
      suggestedStart: null,
      before: { from: '2026-05-20', to: '2026-06-16', days: 28, valueDays: 0 },
      since: { from: '2026-06-17', to: '2026-07-14', days: 28, valueDays: 0 },
      line: 70,
    },
  };
}

describe('CompareSinceMonthTable', () => {
  const bodyRows = () => screen.getAllByRole('row').slice(1) as HTMLElement[];

  test('months oldest first with the start month marked', () => {
    render(
      <CompareSinceMonthTable
        response={sinceResponse(
          'meditated',
          'mood',
          { '2026-06-17': 1, '2026-06-18': 1, '2026-07-01': 1 },
          {
            '2026-05-21': 50,
            '2026-06-17': 80,
            '2026-06-18': 60,
            '2026-07-01': 90,
          }
        )}
      />
    );
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('fmt:2026-05-01');
    expect(rows[1]).toHaveTextContent('fmt:2026-06-01');
    expect(rows[2]).toHaveTextContent('fmt:2026-07-01');
    expect(within(rows[1]!).getByText('Started')).toBeInTheDocument();
    expect(
      within(screen.getByRole('table')).getAllByText('Started')
    ).toHaveLength(1);
    // June: 2 days done; mood averages 70 (7.0); one of two days at or above 70.
    expect(rows[1]).toHaveTextContent('2 days');
    expect(rows[1]).toHaveTextContent('7.0');
    expect(rows[1]).toHaveTextContent('50%');
    // May has no habit days.
    expect(rows[0]).toHaveTextContent('0 days');
    expect(
      screen.getByRole('columnheader', { name: /At or above 7\.0/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /Days with a value/ })
    ).toBeInTheDocument();
  });

  test('an event habit shows days and the total', () => {
    render(
      <CompareSinceMonthTable
        response={sinceResponse(
          'meditationMinutes',
          'mood',
          { '2026-06-17': 10, '2026-06-18': 0, '2026-06-19': 25 },
          { '2026-06-17': 80 }
        )}
      />
    );
    expect(bodyRows()[1]).toHaveTextContent('2 days · 35');
  });

  test('a non-event habit shows its mean, or a dash with no values', () => {
    render(
      <CompareSinceMonthTable
        response={sinceResponse(
          'timeAsleep',
          'mood',
          { '2026-07-01': 400, '2026-07-02': 440 },
          {}
        )}
      />
    );
    const rows = bodyRows();
    expect(rows[2]).toHaveTextContent('420');
    expect(rows[0]).toHaveTextContent('—');
  });

  test('a start more than a year ago says when it started and that the months between are left out', () => {
    const longAgo = sinceResponse(
      'meditated',
      'mood',
      { '2025-03-20': 1, '2026-01-05': 1 },
      { '2025-03-10': 60, '2025-03-20': 70, '2026-01-05': 80 }
    );
    longAgo.result = {
      ...longAgo.result,
      start: '2025-03-15',
      before: { from: '2024-03-15', to: '2025-03-14', days: 365, valueDays: 1 },
      since: { from: '2025-10-21', to: '2026-10-20', days: 365, valueDays: 1 },
    };
    render(<CompareSinceMonthTable response={longAgo} />);
    expect(
      screen.getByText(
        'You started on fmt:2025-03-15. The months between the before and since stretches are left out.'
      )
    ).toBeInTheDocument();
    expect(bodyRows()[0]).toHaveTextContent('fmt:2024-03-01');
  });

  test('a start within the last year has no left-out months line', () => {
    render(
      <CompareSinceMonthTable
        response={sinceResponse('meditated', 'mood', {}, { '2026-06-17': 80 })}
      />
    );
    expect(screen.queryByText(/are left out/)).not.toBeInTheDocument();
  });

  test('a yes/no outcome leaves out the line column', () => {
    render(
      <CompareSinceMonthTable
        response={sinceResponse(
          'meditationMinutes',
          'meditated',
          { '2026-06-17': 10 },
          { '2026-06-17': 1, '2026-06-18': 0, '2026-06-19': 0, '2026-06-20': 1 }
        )}
      />
    );
    expect(
      screen.queryByRole('columnheader', { name: /At or above/ })
    ).not.toBeInTheDocument();
    expect(bodyRows()[1]).toHaveTextContent('50%');
  });
});

// Runs last, so it sees every key the tests above asked for.
describe('en/translation.json', () => {
  test('says the same English as every default the sections pass', () => {
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
    const keys = [...defaultsByKey]
      .filter(([k]) => !pluralByKey.has(k))
      .filter(
        ([k]) =>
          k.startsWith('compareReport.timing.') ||
          k.startsWith('compareReport.days.') ||
          k.startsWith('compareReport.since.months.')
      );
    expect(keys.length).toBeGreaterThan(10);
    const mismatches = keys
      .filter(([key, def]) => leaf(key) !== def)
      .map(([key, def]) => `${key}: ${String(leaf(key))} != ${def}`);
    for (const [key, { one, other }] of pluralByKey) {
      if (leaf(`${key}_one`) !== one) mismatches.push(`${key}_one`);
      if (leaf(`${key}_other`) !== other) mismatches.push(`${key}_other`);
    }
    expect(pluralByKey.size).toBeGreaterThan(0);
    expect(mismatches).toEqual([]);
  });
});
