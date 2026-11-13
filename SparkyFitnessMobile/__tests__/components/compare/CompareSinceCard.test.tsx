import React from 'react';
import { render } from '@testing-library/react-native';
import type {
  CompareSinceResponse,
  CompareSinceResult,
} from '@workspace/shared';

import CompareSinceCard from '../../../src/components/compare/CompareSinceCard';
import { initializeI18n } from '../../../src/localization/i18n';

const BEFORE = {
  from: '2025-10-08',
  to: '2026-03-31',
  days: 175,
  valueDays: 160,
  mean: 58,
  p10: 40,
  p90: 72,
  shareAtOrAbove: 0.38,
};

const OK: CompareSinceResult = {
  status: 'ok',
  start: '2026-04-01',
  suggestedStart: '2026-04-01',
  before: BEFORE,
  since: {
    from: '2026-04-01',
    to: '2026-10-20',
    days: 203,
    valueDays: 190,
    mean: 66,
    p10: 52,
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

function response(result: Partial<CompareSinceResult>): CompareSinceResponse {
  return {
    mode: 'since',
    habit: { key: 'meditated', values: {} },
    outcome: { key: 'mood', values: {} },
    result: { ...OK, ...result },
  };
}

const CAVEAT =
  'A lot can change over months; this shows a change since you started, not that meditating caused it.';

describe('CompareSinceCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows the verdict, the details, the numbers and the caveat', () => {
    const { getByText, queryByText } = render(
      <CompareSinceCard response={response({})} />
    );
    expect(getByText('Yes, it changed')).toBeTruthy();
    expect(
      getByText(
        'Since Apr 1, 2026, your mood averaged 6.6 vs 5.8 before (+0.8).'
      )
    ).toBeTruthy();
    expect(
      getByText('Usually between 5.2 and 8.0 (before: 4.0–7.2).')
    ).toBeTruthy();
    expect(
      getByText('At or above 7.0 on 64% of days (before: 38%).')
    ).toBeTruthy();
    expect(getByText('You kept it up in 24 of 28 weeks since.')).toBeTruthy();
    expect(
      getByText('difference +0.8 · 95% range 0.3 to 1.3 · p 0.004 · 350 days')
    ).toBeTruthy();
    expect(getByText(CAVEAT)).toBeTruthy();
    expect(queryByText(/already/)).toBeNull();
  });

  it('warns when the outcome was already changing', () => {
    const { getByText } = render(
      <CompareSinceCard response={response({ alreadyChanging: true })} />
    );
    expect(
      getByText('⚠ Mood was already rising before you started.')
    ).toBeTruthy();
  });

  it('explains a not-enough answer with no numbers, still with the caveat', () => {
    const { getByText, queryByText } = render(
      <CompareSinceCard
        response={response({
          status: 'not_enough',
          reason: 'fewSince',
          since: {
            from: '2026-04-01',
            to: '2026-10-20',
            days: 203,
            valueDays: 9,
          },
          diff: undefined,
          low: undefined,
          high: undefined,
          p: undefined,
          changed: undefined,
          regularity: undefined,
        })}
      />
    );
    expect(getByText('Not enough since Apr 1, 2026 yet')).toBeTruthy();
    expect(
      getByText('You have 9 days with mood; an answer needs 14.')
    ).toBeTruthy();
    expect(queryByText(/^difference/)).toBeNull();
    expect(queryByText(/^Usually between/)).toBeNull();
    expect(getByText(CAVEAT)).toBeTruthy();
  });

  it('never draws an empty detail line', () => {
    const { getByText, queryByTestId } = render(
      <CompareSinceCard
        response={response({
          changed: false,
          before: { ...BEFORE, mean: undefined },
        })}
      />
    );
    expect(getByText('No clear change')).toBeTruthy();
    expect(queryByTestId('compare-since-detail')).toBeNull();
  });

  it('asks for a start when there is none', () => {
    const { getByText, queryByText } = render(
      <CompareSinceCard
        response={response({
          status: 'not_enough',
          reason: 'noStart',
          start: null,
          suggestedStart: null,
          before: undefined,
          since: undefined,
          line: 0,
          diff: undefined,
          low: undefined,
          high: undefined,
          p: undefined,
          changed: undefined,
          regularity: undefined,
        })}
      />
    );
    expect(getByText('Pick the day you started')).toBeTruthy();
    expect(queryByText(/0\.0/)).toBeNull();
    expect(getByText(CAVEAT)).toBeTruthy();
  });
});
