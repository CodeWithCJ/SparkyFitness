import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CompareStartState from '../../../src/components/compare/CompareStartState';
import { initializeI18n } from '../../../src/localization/i18n';
import { SUGGESTED_QUESTIONS } from '@workspace/shared';

describe('CompareStartState', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('lists the four suggestions and hides recent when empty', () => {
    const { getByText, queryByText, getAllByTestId } = render(
      <CompareStartState recent={[]} onPick={jest.fn()} />
    );
    expect(getByText('Try one of these')).toBeTruthy();
    expect(getAllByTestId(/^compare-suggestion-/)).toHaveLength(4);
    expect(
      getByText("Does last night's time asleep go with energy that day?")
    ).toBeTruthy();
    expect(queryByText('Your recent questions')).toBeNull();
  });

  it('shows recent questions and reports a tap', () => {
    const onPick = jest.fn();
    const recent = [{ a: 'mood', b: 'energy', choice: 'sameDay' } as const];
    const { getByText } = render(
      <CompareStartState recent={recent} onPick={onPick} />
    );
    expect(getByText('Your recent questions')).toBeTruthy();
    fireEvent.press(getByText('Does mood go with energy the same day?'));
    expect(onPick).toHaveBeenCalledWith(recent[0]);
    fireEvent.press(getByText('Does meditating go with mood the same day?'));
    expect(onPick).toHaveBeenCalledWith(SUGGESTED_QUESTIONS[1]);
  });

  it('reads a since question as the since sentence', () => {
    const recent = [
      { a: 'meditated', b: 'mood', choice: 'sinceHabit' } as const,
    ];
    const { getByText } = render(
      <CompareStartState recent={recent} onPick={jest.fn()} />
    );
    expect(
      getByText('Since I started meditating regularly, has mood changed?')
    ).toBeTruthy();
  });
});
