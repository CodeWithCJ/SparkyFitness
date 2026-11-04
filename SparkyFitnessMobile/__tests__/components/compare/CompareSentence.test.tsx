import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import CompareSentence from '../../../src/components/compare/CompareSentence';
import i18n, { initializeI18n } from '../../../src/localization/i18n';
import { sentenceText } from '../../../src/utils/compareCopy';
import { sinceSentence } from '../../../src/utils/compareSinceCopy';
import type { CompareQuestion } from '@workspace/shared';

const t = ((key: string, options: Record<string, unknown>) =>
  i18n.t(key, options)) as never;

jest.mock('../../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      sections,
      onSelect,
      value,
      renderTrigger,
    }: {
      title: string;
      sections: { options: { label: string; value: string }[] }[];
      onSelect: (value: string) => void;
      value: string;
      renderTrigger: (p: {
        onPress: () => void;
        selectedOption: { label: string; value: string } | undefined;
      }) => React.ReactNode;
    }) => {
      const options = sections.flatMap((s) => s.options);
      return (
        <View>
          {renderTrigger({
            onPress: () => undefined,
            selectedOption: options.find((o) => o.value === value),
          })}
          {options.map((o) => (
            <Pressable
              key={o.value}
              testID={`${title}-${o.value}`}
              onPress={() => onSelect(o.value)}
            >
              <Text>{o.label}</Text>
            </Pressable>
          ))}
        </View>
      );
    },
  };
});

describe('CompareSentence', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows empty slots as "something"', () => {
    const { getAllByText } = render(
      <CompareSentence question={{}} onChange={jest.fn()} />
    );
    expect(getAllByText('something')).toHaveLength(2);
  });

  it('reads like the sentence for a full question', () => {
    const { getByText } = render(
      <CompareSentence
        question={{ a: 'meditated', b: 'mood', choice: 'sameDay' }}
        onChange={jest.fn()}
      />
    );
    expect(getByText('meditating')).toBeTruthy();
    expect(getByText('mood')).toBeTruthy();
    expect(getByText('the same day')).toBeTruthy();
  });

  it.each<CompareQuestion>([
    { a: 'timeAsleep', b: 'energy', choice: 'nextDay' },
    { a: 'caffeine', b: 'timeAsleep', choice: 'sameDay' },
    { a: 'timeAsleep', b: 'sleepScore', choice: 'dayBefore' },
    { a: 'meditated', b: 'timeAsleep', choice: 'nextDay' },
    { a: 'mood', b: 'meditated', choice: 'dayBefore' },
    { a: 'timeAsleep', b: 'mood', choice: 'sameWeek' },
    { a: 'calories', b: 'overnightHrv', choice: 'nextWeek' },
  ])('chips read exactly like the sentence for %j', (question) => {
    const { getByLabelText } = render(
      <CompareSentence question={question} onChange={jest.fn()} />
    );
    const chip = (name: string) =>
      String(
        getByLabelText(new RegExp(`^${name}: `)).props.accessibilityLabel
      ).slice(name.length + 2);
    expect(
      `Does ${chip('First thing')} go with ${chip('Second thing')} ${chip('When')}?`
    ).toBe(sentenceText(question, t));
  });

  it('names a sleep metric plainly once the question is by the week', () => {
    const { getByLabelText } = render(
      <CompareSentence
        question={{ a: 'timeAsleep', choice: 'sameWeek' }}
        onChange={jest.fn()}
      />
    );
    expect(getByLabelText('First thing: time asleep')).toBeTruthy();
  });

  it('announces each trigger with its current value', () => {
    const { getByLabelText } = render(
      <CompareSentence
        question={{ a: 'timeAsleep', choice: 'sameDay' }}
        onChange={jest.fn()}
      />
    );
    expect(
      getByLabelText("First thing: last night's time asleep")
    ).toBeTruthy();
    expect(getByLabelText('Second thing: something')).toBeTruthy();
    expect(getByLabelText('When: the same day')).toBeTruthy();
  });

  it('sets B when a metric is chosen for it', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CompareSentence
        question={{ a: 'timeAsleep', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    fireEvent.press(getByTestId('Second thing-energy'));
    expect(onChange).toHaveBeenCalledWith({
      a: 'timeAsleep',
      b: 'energy',
      choice: 'sameDay',
    });
  });

  it("swaps A and B when A is given B's metric", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CompareSentence
        question={{ a: 'timeAsleep', b: 'mood', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    fireEvent.press(getByTestId('First thing-mood'));
    expect(onChange).toHaveBeenCalledWith({
      a: 'mood',
      b: 'timeAsleep',
      choice: 'sameDay',
    });
  });

  it.each<CompareQuestion>([
    { a: 'meditated', b: 'mood', choice: 'sinceHabit' },
    { a: 'caffeine', b: 'timeAsleep', choice: 'sinceHabit' },
  ])('since chips read exactly like the since sentence for %j', (question) => {
    const { getByLabelText } = render(
      <CompareSentence question={question} onChange={jest.fn()} />
    );
    const chip = (name: string) =>
      String(
        getByLabelText(new RegExp(`^${name}: `)).props.accessibilityLabel
      ).slice(name.length + 2);
    expect(
      `${chip('When')} I started ${chip('First thing')} regularly, has ${chip('Second thing')} changed?`
    ).toBe(sinceSentence(question, t));
  });

  it('offers since a habit started in the timing picker', () => {
    const onChange = jest.fn();
    const { getByTestId, getByText } = render(
      <CompareSentence
        question={{ a: 'meditated', b: 'mood', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    expect(getByText('Before vs. since')).toBeTruthy();
    fireEvent.press(getByTestId('When-sinceHabit'));
    expect(onChange).toHaveBeenCalledWith({
      a: 'meditated',
      b: 'mood',
      choice: 'sinceHabit',
    });
  });

  it('keeps a metric with no weekly form when since a habit started is chosen', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CompareSentence
        question={{ a: 'meditationSessions7d', b: 'mood', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    fireEvent.press(getByTestId('When-sinceHabit'));
    expect(onChange).toHaveBeenCalledWith({
      a: 'meditationSessions7d',
      b: 'mood',
      choice: 'sinceHabit',
    });
  });

  it('lets a since question switch back to day by day', () => {
    const onChange = jest.fn();
    const { getByTestId, queryByText } = render(
      <CompareSentence
        question={{ a: 'meditated', b: 'mood', choice: 'sinceHabit' }}
        onChange={onChange}
      />
    );
    expect(queryByText('Does')).toBeNull();
    fireEvent.press(getByTestId('When-sameDay'));
    expect(onChange).toHaveBeenCalledWith({
      a: 'meditated',
      b: 'mood',
      choice: 'sameDay',
    });
  });

  it("clears a metric that isn't offered weekly when a week timing is chosen", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CompareSentence
        question={{ a: 'meditationSessions7d', b: 'mood', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    fireEvent.press(getByTestId('When-sameWeek'));
    const next = onChange.mock.calls[0][0];
    expect(next.choice).toBe('sameWeek');
    expect(next.a).toBeUndefined();
    expect(next.b).toBe('mood');
  });

  it('clears weight trend when "Before vs. since" is chosen', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CompareSentence
        question={{ a: 'meditated', b: 'weightTrend', choice: 'sameDay' }}
        onChange={onChange}
      />
    );
    fireEvent.press(getByTestId('When-sinceHabit'));
    const next = onChange.mock.calls[0][0];
    expect(next.choice).toBe('sinceHabit');
    expect(next.a).toBe('meditated');
    expect(next.b).toBeUndefined();
  });

  it('the since pickers do not offer weight trend', () => {
    const { queryByText, queryByTestId } = render(
      <CompareSentence
        question={{ a: 'meditated', choice: 'sinceHabit' }}
        onChange={jest.fn()}
      />
    );
    expect(queryByText('Weight trend')).toBeNull();
    expect(queryByTestId('Second thing-weightTrend')).toBeNull();
    expect(queryByTestId('Second thing-mood')).toBeTruthy();
  });
});
