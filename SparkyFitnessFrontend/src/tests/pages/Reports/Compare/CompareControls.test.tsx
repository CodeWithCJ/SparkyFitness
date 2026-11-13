import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  SUGGESTED_QUESTIONS,
  type CompareMetricKey,
  type CompareQuestion,
  type CompareSinceResponse,
  type CompareSinceResult,
} from '@workspace/shared';
import { CompareSinceControls } from '@/pages/Reports/Compare/CompareSinceControls';
import { CompareSentence } from '@/pages/Reports/Compare/CompareSentence';
import { CompareSpanControl } from '@/pages/Reports/Compare/CompareSpanControl';
import { clampCustomRange } from '@/pages/Reports/Compare/compareCustomRange';
import { CompareStartState } from '@/pages/Reports/Compare/CompareStartState';

// Every key the controls ask for, so the last test can check en/translation.json
// says the same English.
const defaultsByKey = new Map<string, string>();

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
        return actual.translateForTest(key, a, b);
      },
    }),
  };
});

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatDateInUserTimezone: (d: string) => `fmt:${d}`,
  }),
}));

beforeAll(() => {
  // Radix Select leans on these, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

function open(trigger: HTMLElement) {
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

describe('CompareSentence', () => {
  test('reads "Does … go with … ?" for sleep and energy that day', () => {
    render(
      <CompareSentence
        question={{ a: 'timeAsleep', b: 'energy', choice: 'sameDay' }}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByText('Does')).toBeInTheDocument();
    expect(screen.getByText("last night's time asleep")).toBeInTheDocument();
    expect(screen.getByText('go with')).toBeInTheDocument();
    expect(screen.getByText('energy')).toBeInTheDocument();
    expect(screen.getByText('that day')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  test('the timing picker lists six choices, the last "Before vs. since"', () => {
    const onChange = jest.fn();
    render(
      <CompareSentence
        question={{ a: 'timeAsleep', b: 'energy', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    open(screen.getByRole('combobox', { name: /When/ }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual([
      'The same day',
      'The next day',
      'The day before',
      'The same week',
      'The next week',
      'Before vs. since',
    ]);
    expect(screen.getByText('Since a habit started')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Before vs. since' }));
    expect(onChange).toHaveBeenLastCalledWith({
      a: 'timeAsleep',
      b: 'energy',
      choice: 'sinceHabit',
    });
    open(screen.getByRole('combobox', { name: /When/ }));
    fireEvent.click(screen.getByRole('option', { name: 'The next day' }));
    expect(onChange).toHaveBeenCalledWith({
      a: 'timeAsleep',
      b: 'energy',
      choice: 'nextDay',
    });
  });

  test('a since question reads "Since I started … regularly, has … changed?"', () => {
    const onChange = jest.fn();
    render(
      <CompareSentence
        question={{ a: 'meditated', b: 'mood', choice: 'sinceHabit' }}
        onChange={onChange}
      />
    );
    expect(screen.queryByText('Does')).toBeNull();
    expect(screen.getByRole('combobox', { name: /When: Since/ })).toBeTruthy();
    expect(screen.getByText('I started')).toBeInTheDocument();
    expect(screen.getByText('regularly, has')).toBeInTheDocument();
    expect(screen.getByText('changed?')).toBeInTheDocument();
    open(screen.getByRole('combobox', { name: /When/ }));
    // The timing picker is how the person switches back to a day question.
    fireEvent.click(screen.getByRole('option', { name: 'The same day' }));
    expect(onChange).toHaveBeenCalledWith({
      a: 'meditated',
      b: 'mood',
      choice: 'sameDay',
    });
  });

  test('a week question with a day-only metric shows the day-only line', () => {
    render(
      <CompareSentence
        question={{
          a: 'meditationSessions7d',
          b: 'energy',
          choice: 'sameWeek',
        }}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByText(/can only be compared by day/)).toBeInTheDocument();
  });

  test('choosing Before vs. since clears weight trend', () => {
    const onChange = jest.fn();
    render(
      <CompareSentence
        question={{ a: 'meditated', b: 'weightTrend', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    open(screen.getByRole('combobox', { name: /When/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Before vs. since' }));
    expect(onChange).toHaveBeenLastCalledWith({
      a: 'meditated',
      b: undefined,
      choice: 'sinceHabit',
    });
  });

  test("choosing a week timing clears a metric that isn't offered weekly", () => {
    const onChange = jest.fn();
    render(
      <CompareSentence
        question={{
          a: 'meditationSessions7d',
          b: 'mood',
          choice: 'sameDay',
        }}
        onChange={onChange}
      />
    );
    open(screen.getByRole('combobox', { name: /When/ }));
    fireEvent.click(screen.getByRole('option', { name: 'The same week' }));
    expect(onChange).toHaveBeenLastCalledWith({
      a: undefined,
      b: 'mood',
      choice: 'sameWeek',
    });
  });

  test('the since outcome picker does not list Weight trend', () => {
    render(
      <CompareSentence
        question={{ a: 'meditated', b: 'mood', choice: 'sinceHabit' }}
        onChange={jest.fn()}
      />
    );
    open(screen.getByRole('combobox', { name: /Second thing/ }));
    const listbox = screen.getByRole('listbox');
    expect(
      within(listbox).getByRole('option', { name: 'Energy' })
    ).toBeInTheDocument();
    expect(
      within(listbox).queryByRole('option', { name: /Weight trend/ })
    ).toBeNull();
  });

  test('the metric picker is grouped and leaves out the other side', () => {
    render(
      <CompareSentence
        question={{ a: 'timeAsleep', b: 'energy', choice: 'sameDay' }}
        onChange={jest.fn()}
      />
    );
    open(screen.getByRole('combobox', { name: /Second thing/ }));
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Sleep')).toBeInTheDocument();
    expect(within(listbox).getByText('How you felt')).toBeInTheDocument();
    expect(
      within(listbox).queryByRole('option', { name: 'Time asleep' })
    ).toBeNull();
    expect(
      within(listbox).getByRole('option', { name: 'Mood' })
    ).toBeInTheDocument();
  });
});

describe('CompareStartState', () => {
  test('picking a suggested question calls onPick with it', () => {
    const onPick = jest.fn();
    render(<CompareStartState recent={[]} onPick={onPick} />);
    expect(screen.getByText('Try one of these')).toBeInTheDocument();
    expect(screen.queryByText('Your recent questions')).toBeNull();
    const first = SUGGESTED_QUESTIONS[0] as CompareQuestion;
    fireEvent.click(
      screen.getByRole('button', {
        name: "Does last night's time asleep go with energy that day?",
      })
    );
    expect(onPick).toHaveBeenCalledWith(first);
  });

  test('a recent since question reads its since sentence', () => {
    render(
      <CompareStartState
        recent={[{ a: 'meditated', b: 'mood', choice: 'sinceHabit' }]}
        onPick={jest.fn()}
      />
    );
    expect(
      screen.getByRole('button', {
        name: 'Since I started meditating regularly, has mood changed?',
      })
    ).toBeInTheDocument();
  });

  test('shows at most five recent questions', () => {
    const recent: CompareQuestion[] = (
      [
        'energy',
        'mood',
        'focus',
        'sleepScore',
        'overnightHrv',
        'bedtime',
      ] as const
    ).map((b) => ({ a: 'timeAsleep', b, choice: 'sameDay' }));
    render(<CompareStartState recent={recent} onPick={jest.fn()} />);
    expect(screen.getByText('Your recent questions')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^compare-recent-/)).toHaveLength(5);
  });
});

describe('CompareSpanControl', () => {
  const base = { today: '2026-10-22', custom: null };

  test('offers the day spans and Custom', () => {
    const onChange = jest.fn();
    render(
      <CompareSpanControl mode="day" span="90d" onChange={onChange} {...base} />
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '30 days',
      '60 days',
      '90 days',
      'Custom',
    ]);
    fireEvent.click(screen.getByRole('button', { name: '60 days' }));
    expect(onChange).toHaveBeenCalledWith('60d', null);
  });

  test('offers the week spans', () => {
    render(
      <CompareSpanControl
        mode="week"
        span="6m"
        onChange={jest.fn()}
        {...base}
      />
    );
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '6 months',
      '1 year',
      'Custom',
    ]);
  });

  test('Custom starts from the current window and shows two date pickers', () => {
    const onChange = jest.fn();
    render(
      <CompareSpanControl mode="day" span="90d" onChange={onChange} {...base} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(onChange).toHaveBeenCalledWith('custom', {
      startDate: '2026-07-25',
      endDate: '2026-10-22',
    });
  });

  test('a custom range shows both dates', () => {
    render(
      <CompareSpanControl
        mode="day"
        span="custom"
        custom={{ startDate: '2026-09-01', endDate: '2026-10-01' }}
        today="2026-10-22"
        onChange={jest.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: /Start date/ })
    ).toHaveTextContent('fmt:2026-09-01');
    expect(screen.getByRole('button', { name: /End date/ })).toHaveTextContent(
      'fmt:2026-10-01'
    );
  });
});

describe('CompareSinceControls', () => {
  const today = '2026-10-22';

  function answer(
    outcome: CompareMetricKey,
    result: Partial<CompareSinceResult>
  ): CompareSinceResponse {
    return {
      mode: 'since',
      habit: { key: 'meditated', values: {} },
      outcome: { key: outcome, values: {} },
      result: {
        status: 'ok',
        start: '2026-04-01',
        suggestedStart: '2026-04-01',
        line: 50,
        ...result,
      },
    };
  }

  function renderControls(
    props: Partial<React.ComponentProps<typeof CompareSinceControls>>
  ) {
    const onStartChange = jest.fn();
    const onLineChange = jest.fn();
    render(
      <CompareSinceControls
        response={undefined}
        outcome="mood"
        today={today}
        habitStart={null}
        line={null}
        onStartChange={onStartChange}
        onLineChange={onLineChange}
        {...props}
      />
    );
    return { onStartChange, onLineChange };
  }

  test('the suggested start shows with "(suggested)" until a day is picked', () => {
    const response = answer('mood', { suggestedStart: '2026-04-01' });
    const { unmount } = render(
      <CompareSinceControls
        response={response}
        outcome="mood"
        today={today}
        habitStart={null}
        line={null}
        onStartChange={jest.fn()}
        onLineChange={jest.fn()}
      />
    );
    expect(screen.getByText('Since')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Start date/ })
    ).toHaveTextContent('fmt:2026-04-01');
    expect(screen.getByText('(suggested)')).toBeInTheDocument();
    unmount();
    renderControls({ response, habitStart: '2026-05-05' });
    expect(
      screen.getByRole('button', { name: /Start date/ })
    ).toHaveTextContent('fmt:2026-05-05');
    expect(screen.queryByText('(suggested)')).toBeNull();
  });

  test('with no start and no suggestion the chip reads "Pick a date" and no line row shows', () => {
    renderControls({
      response: answer('mood', {
        status: 'not_enough',
        reason: 'noStart',
        start: null,
        suggestedStart: null,
      }),
    });
    expect(
      screen.getByRole('button', { name: /Start date/ })
    ).toHaveTextContent('Pick a date');
    expect(screen.queryByText('(suggested)')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  test('days outside 730 days ago to yesterday are disabled', () => {
    const day = (n: string) =>
      screen
        .getAllByRole('gridcell')
        .map((c) => c.querySelector('button'))
        .find((b) => b?.textContent === n && !b.closest('[data-outside]'));

    // Today is 2026-10-22: the latest start is the 21st.
    const { unmount } = render(
      <CompareSinceControls
        response={undefined}
        outcome="mood"
        today={today}
        habitStart="2026-10-10"
        line={null}
        onStartChange={jest.fn()}
        onLineChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Start date/ }));
    expect(day('21')?.hasAttribute('disabled')).toBe(false);
    expect(day('22')?.hasAttribute('disabled')).toBe(true);
    unmount();

    // 730 days before is 2024-10-22.
    renderControls({ habitStart: '2024-10-25' });
    fireEvent.click(screen.getByRole('button', { name: /Start date/ }));
    expect(day('21')?.hasAttribute('disabled')).toBe(true);
    expect(day('22')?.hasAttribute('disabled')).toBe(false);
  });

  test('picking a day sends it', () => {
    const { onStartChange } = renderControls({ habitStart: '2026-10-10' });
    fireEvent.click(screen.getByRole('button', { name: /Start date/ }));
    const btn = screen
      .getAllByRole('gridcell')
      .map((c) => c.querySelector('button'))
      .find((b) => b?.textContent === '12' && !b.closest('[data-outside]'));
    fireEvent.click(btn as HTMLElement);
    expect(onStartChange).toHaveBeenCalledWith('2026-10-12');
  });

  test('a yes/no outcome has no line row', () => {
    renderControls({
      outcome: 'meditated',
      response: answer('meditated', { line: 1 }),
    });
    expect(screen.getByRole('button', { name: /Start date/ })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/Line:/)).toBeNull();
  });

  test('picking a line sends its stored-scale value', () => {
    const { onLineChange } = renderControls({
      response: answer('mood', { line: 50 }),
    });
    expect(screen.getByText('Line: Mood ≥')).toBeInTheDocument();
    const trigger = screen.getByRole('combobox', { name: /at or above/ });
    expect(trigger).toHaveTextContent('5.0');
    open(trigger);
    fireEvent.click(screen.getByRole('option', { name: '7.0' }));
    expect(onLineChange).toHaveBeenCalledWith(70);
  });

  test("a picked line wins over the answer's", () => {
    renderControls({ response: answer('mood', { line: 50 }), line: 80 });
    expect(
      screen.getByRole('combobox', { name: /at or above/ })
    ).toHaveTextContent('8');
  });
});

describe('custom range bounds', () => {
  const today = '2026-10-22';

  test('an end that makes the span too long moves the start', () => {
    // 180 days is the day limit: 2026-04-25 .. 2026-10-21 is exactly 180.
    expect(
      clampCustomRange(
        { startDate: '2026-04-25', endDate: '2026-10-22' },
        today,
        180
      )
    ).toEqual({ startDate: '2026-04-26', endDate: '2026-10-22' });
    expect(
      clampCustomRange(
        { startDate: '2026-04-25', endDate: '2026-10-21' },
        today,
        180
      )
    ).toEqual({ startDate: '2026-04-25', endDate: '2026-10-21' });
  });

  test('the end never passes today and the start never passes the end', () => {
    expect(
      clampCustomRange(
        { startDate: '2026-10-01', endDate: '2026-11-30' },
        today,
        180
      )
    ).toEqual({ startDate: '2026-10-01', endDate: today });
    expect(
      clampCustomRange(
        { startDate: '2026-10-30', endDate: '2026-10-22' },
        today,
        180
      )
    ).toEqual({ startDate: today, endDate: today });
  });

  test('picking a later end in the calendar sends the clamped range', () => {
    const onChange = jest.fn();
    render(
      <CompareSpanControl
        mode="day"
        span="custom"
        custom={{ startDate: '2026-04-20', endDate: '2026-10-01' }}
        today={today}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /End date/ }));
    // Today is the last pickable end; dates after it are disabled.
    const day = (n: string) =>
      screen
        .getAllByRole('gridcell')
        .map((c) => c.querySelector('button'))
        .find((b) => b?.textContent === n && !b.closest('[data-outside]'));
    expect(day('23')?.hasAttribute('disabled')).toBe(true);
    fireEvent.click(day('21') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith('custom', {
      startDate: '2026-04-25',
      endDate: '2026-10-21',
    });
  });

  test('the start picker disables days past the limit', () => {
    render(
      <CompareSpanControl
        mode="day"
        span="custom"
        custom={{ startDate: '2026-04-25', endDate: '2026-10-21' }}
        today={today}
        onChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Start date/ }));
    const cells = screen.getAllByRole('gridcell');
    const btn = (n: string) =>
      cells
        .map((c) => c.querySelector('button'))
        .find((b) => b?.textContent === n && !b.closest('[data-outside]'));
    // April 24 is 181 days back from Oct 21; April 25 is the earliest.
    expect(btn('24')?.hasAttribute('disabled')).toBe(true);
    expect(btn('25')?.hasAttribute('disabled')).toBe(false);
  });
});

// Runs last, so it sees every key the tests above asked for.
describe('en/translation.json', () => {
  test('says the same English as every default the controls pass', () => {
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
    const keys = [...defaultsByKey].filter(([k]) =>
      k.startsWith('compareReport.')
    );
    expect(keys.length).toBeGreaterThan(15);
    const mismatches = keys
      .filter(([key, def]) => leaf(key) !== def)
      .map(([key, def]) => `${key}: ${String(leaf(key))} != ${def}`);
    expect(mismatches).toEqual([]);
  });
});
