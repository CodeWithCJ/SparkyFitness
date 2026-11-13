import React from 'react';
import { render } from '@testing-library/react-native';
import {
  type CompareQuestion,
  type CompareResponse,
  type CompareResult,
} from '@workspace/shared';

import CompareBars from '../../../src/components/compare/CompareBars';
import { initializeI18n } from '../../../src/localization/i18n';

const Q: CompareQuestion = { a: 'meditated', b: 'mood', choice: 'sameDay' };

function response(binary: CompareResult['binary']): CompareResponse {
  return {
    a: { key: Q.a, values: {} },
    b: { key: Q.b, values: {} },
    through: '2026-10-21',
    deviations: { a: {}, b: {} },
    result: {
      status: 'ok',
      n: 40,
      needed: 5,
      method: 'difference',
      checks: { ownNormal: true },
      binary,
    },
  } as CompareResponse;
}

describe('CompareBars', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows mood means on the 1-10 scale with day counts', () => {
    const { getByText, queryByText } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 72,
          noMean: 63,
          yesCount: 12,
          noCount: 28,
          diff: 6,
        })}
        question={Q}
      />
    );
    expect(getByText('Days you meditated')).toBeTruthy();
    expect(getByText('Days without meditating')).toBeTruthy();
    expect(getByText('7.2 · 12 days')).toBeTruthy();
    expect(getByText('6.3 · 28 days')).toBeTruthy();
    expect(
      getByText(
        '0.6 higher than on days without meditating (each measured against your own normal)'
      )
    ).toBeTruthy();
    expect(queryByText(/72/)).toBeNull();
  });

  it('fills the larger mean to 100% and the other in proportion', () => {
    const { getByTestId } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 72,
          noMean: 36,
          yesCount: 12,
          noCount: 28,
          diff: 3,
        })}
        question={Q}
      />
    );
    expect(
      getByTestId('compare-bar-yes', { includeHiddenElements: true }).props
        .style
    ).toEqual({
      width: '100%',
    });
    expect(
      getByTestId('compare-bar-no', { includeHiddenElements: true }).props.style
    ).toEqual({ width: '50%' });
  });

  it('keeps both bars at 0% when both means are 0', () => {
    const { getByTestId, getByText } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 0,
          noMean: 0,
          yesCount: 6,
          noCount: 9,
          diff: 0,
        })}
        question={Q}
      />
    );
    expect(
      getByTestId('compare-bar-yes', { includeHiddenElements: true }).props
        .style
    ).toEqual({ width: '0%' });
    expect(
      getByTestId('compare-bar-no', { includeHiddenElements: true }).props.style
    ).toEqual({ width: '0%' });
    expect(
      getByText(
        'About the same as on days without meditating (each measured against your own normal)'
      )
    ).toBeTruthy();
  });

  it('words a negative difference as lower, without a sign', () => {
    const { getByText } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 63,
          noMean: 72,
          yesCount: 12,
          noCount: 28,
          diff: -6,
        })}
        question={Q}
      />
    );
    expect(
      getByText(
        '0.6 lower than on days without meditating (each measured against your own normal)'
      )
    ).toBeTruthy();
  });

  // The yes/no side is dated by the day; a sleep outcome by the wake day.
  it.each<[CompareQuestion, string, string, string]>([
    [
      { a: 'meditated', b: 'mood', choice: 'dayBefore' },
      'The day before you meditated',
      'Other days',
      '6.3 · 28 days',
    ],
    [
      { a: 'meditated', b: 'mood', choice: 'sameDay' },
      'Days you meditated',
      'Days without meditating',
      '6.3 · 28 days',
    ],
    [
      { a: 'meditated', b: 'mood', choice: 'nextDay' },
      'The day after you meditated',
      'Other days',
      '6.3 · 28 days',
    ],
    [
      { a: 'mood', b: 'meditated', choice: 'dayBefore' },
      'The day after you meditated',
      'Other days',
      '6.3 · 28 days',
    ],
    [
      { a: 'mood', b: 'meditated', choice: 'sameDay' },
      'Days you meditated',
      'Days without meditating',
      '6.3 · 28 days',
    ],
    [
      { a: 'mood', b: 'meditated', choice: 'nextDay' },
      'The day before you meditated',
      'Other days',
      '6.3 · 28 days',
    ],
    [
      { a: 'meditated', b: 'timeAsleep', choice: 'dayBefore' },
      'Two nights before you meditated',
      'Other nights',
      '63.0 · 28 nights',
    ],
    [
      { a: 'meditated', b: 'timeAsleep', choice: 'sameDay' },
      'The night before you meditated',
      'Other nights',
      '63.0 · 28 nights',
    ],
    [
      { a: 'meditated', b: 'timeAsleep', choice: 'nextDay' },
      'The night after you meditated',
      'Other nights',
      '63.0 · 28 nights',
    ],
    [
      { a: 'timeAsleep', b: 'meditated', choice: 'dayBefore' },
      'The night after you meditated',
      'Other nights',
      '63.0 · 28 nights',
    ],
    [
      { a: 'timeAsleep', b: 'meditated', choice: 'sameDay' },
      'The night before you meditated',
      'Other nights',
      '63.0 · 28 nights',
    ],
    [
      { a: 'timeAsleep', b: 'meditated', choice: 'nextDay' },
      'Two nights before you meditated',
      'Other nights',
      '63.0 · 28 nights',
    ],
  ])('labels %j by its timing', (question, yes, no, noMean) => {
    const { getByText } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 72,
          noMean: 63,
          yesCount: 12,
          noCount: 28,
          diff: 6,
        })}
        question={question}
      />
    );
    expect(getByText(yes)).toBeTruthy();
    expect(getByText(no)).toBeTruthy();
    expect(getByText(noMean)).toBeTruthy();
  });

  it('shows a bedtime outcome as clock times and its difference in minutes', () => {
    const { getByText } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 255,
          noMean: 230,
          yesCount: 12,
          noCount: 28,
          diff: 25,
        })}
        question={{ a: 'meditated', b: 'bedtime', choice: 'sameDay' }}
      />
    );
    expect(getByText(/^10:15\sPM · 12 nights$/)).toBeTruthy();
    expect(getByText(/^9:50\sPM · 28 nights$/)).toBeTruthy();
    expect(
      getByText(
        '25 min later than on other nights (each measured against your own normal)'
      )
    ).toBeTruthy();
  });

  it('words an earlier bedtime in minutes, without a sign', () => {
    const { getByText } = render(
      <CompareBars
        response={response({
          yesKey: 'meditated',
          yesMean: 230,
          noMean: 242,
          yesCount: 12,
          noCount: 28,
          diff: -12.4,
        })}
        question={{ a: 'meditated', b: 'bedtime', choice: 'sameDay' }}
      />
    );
    expect(
      getByText(
        '12 min earlier than on other nights (each measured against your own normal)'
      )
    ).toBeTruthy();
  });

  it('renders nothing without a yes/no result', () => {
    const { toJSON } = render(
      <CompareBars response={response(undefined)} question={Q} />
    );
    expect(toJSON()).toBeNull();
  });
});
