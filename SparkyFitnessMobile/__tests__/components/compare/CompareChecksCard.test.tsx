import React from 'react';
import { render } from '@testing-library/react-native';
import {
  type CompareMode,
  type CompareQuestion,
  type CompareResult,
} from '@workspace/shared';

import CompareChecksCard from '../../../src/components/compare/CompareChecksCard';
import { initializeI18n } from '../../../src/localization/i18n';

const DAY_Q: CompareQuestion = { a: 'mood', b: 'energy', choice: 'sameDay' };

function result(
  linked: boolean,
  checks: Partial<CompareResult['checks']> = {}
): CompareResult {
  return {
    status: 'ok',
    n: 40,
    needed: 14,
    linked,
    checks: { ownNormal: true, ...checks },
  } as CompareResult;
}

function renderCard(
  r: CompareResult,
  question: CompareQuestion = DAY_Q,
  mode: CompareMode = 'day'
) {
  return render(
    <CompareChecksCard result={r} question={question} mode={mode} />
  );
}

describe('CompareChecksCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows only the two fixed lines when not linked', () => {
    const { getByText, queryByText } = renderCard(
      result(false, { direction: 'firstComesFirst', weekend: 'holds' })
    );
    expect(getByText('✓ Compared with your own normal')).toBeTruthy();
    expect(getByText('A link, not proof of cause')).toBeTruthy();
    expect(queryByText(/comes first|seems to come first/)).toBeNull();
    expect(queryByText(/weekend/i)).toBeNull();
  });

  it('adds direction and weekend lines when linked in day mode', () => {
    const { getByText } = renderCard(
      result(true, { direction: 'firstComesFirst', weekend: 'holds' })
    );
    expect(getByText('Mood seems to come first')).toBeTruthy();
    expect(getByText('Still holds after accounting for weekends')).toBeTruthy();
  });

  it('shows the weekday pattern warning', () => {
    const { getByText } = renderCard(
      result(true, { weekend: 'mayBeWeekends' })
    );
    expect(
      getByText('This may be a weekday-versus-weekend pattern')
    ).toBeTruthy();
  });

  it('omits the weekend line in week mode', () => {
    const q: CompareQuestion = { a: 'mood', b: 'energy', choice: 'sameWeek' };
    const { queryByText } = renderCard(
      result(true, { weekend: 'holds' }),
      q,
      'week'
    );
    expect(queryByText(/weekend/i)).toBeNull();
  });

  it('names B at timing 0 when the link is stronger the other way', () => {
    const { getByText } = renderCard(
      result(true, { direction: 'strongerOtherWay' })
    );
    expect(getByText('Energy seems to come first')).toBeTruthy();
  });

  it('names B first at timing -1 with firstComesFirst', () => {
    const q: CompareQuestion = { a: 'mood', b: 'energy', choice: 'dayBefore' };
    const { getByText } = renderCard(
      result(true, { direction: 'firstComesFirst' }),
      q
    );
    expect(getByText('Energy comes first')).toBeTruthy();
  });

  it('names A first at timing +1 and reads the other way round', () => {
    const q: CompareQuestion = { a: 'mood', b: 'energy', choice: 'nextDay' };
    const first = renderCard(result(true, { direction: 'firstComesFirst' }), q);
    expect(first.getByText('Mood comes first')).toBeTruthy();
    const other = renderCard(
      result(true, { direction: 'strongerOtherWay' }),
      q
    );
    expect(
      other.getByText('The link is stronger the other way round')
    ).toBeTruthy();
  });

  it.each<[CompareQuestion, CompareMode, string]>([
    [
      { a: 'timeAsleep', b: 'energy', choice: 'nextDay' },
      'day',
      'Time asleep comes first',
    ],
    [
      { a: 'caffeine', b: 'timeAsleep', choice: 'dayBefore' },
      'day',
      'Time asleep comes first',
    ],
    [
      { a: 'timeAsleep', b: 'energy', choice: 'sameDay' },
      'day',
      'Time asleep seems to come first',
    ],
    [
      { a: 'mood', b: 'meditated', choice: 'dayBefore' },
      'day',
      'Meditating comes first',
    ],
    [
      { a: 'sleepScore', b: 'mood', choice: 'nextWeek' },
      'week',
      'Sleep score comes first',
    ],
  ])('names the metric that leads plainly for %j', (q, mode, line) => {
    const { getByText, queryByText } = renderCard(
      result(true, { direction: 'firstComesFirst' }),
      q,
      mode
    );
    expect(getByText(line)).toBeTruthy();
    expect(queryByText(/last night/i)).toBeNull();
  });

  it("says it can't tell", () => {
    const { getByText } = renderCard(result(true, { direction: 'cantTell' }));
    expect(getByText("Can't tell which comes first")).toBeTruthy();
  });
});
