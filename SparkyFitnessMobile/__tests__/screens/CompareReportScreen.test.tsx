import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  addDays,
  type CompareQuestion,
  type CompareResponse,
  type CompareSinceResponse,
  type CompareSinceResult,
  compareWindow,
} from '@workspace/shared';

import CompareReportScreen from '../../src/screens/CompareReportScreen';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import { getTodayDate } from '../../src/utils/dateUtils';

const mockUseCompare = jest.fn();
const mockUseCompareSince = jest.fn();
jest.mock('../../src/hooks/useCompare', () => ({
  useCompare: (...args: unknown[]) => mockUseCompare(...args),
  useCompareSince: (...args: unknown[]) => mockUseCompareSince(...args),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/DateRangeSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(() => <View testID="date-range-sheet" />),
  };
});
jest.mock('../../src/components/compare/CompareChart', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="compare-chart" /> };
});
jest.mock('../../src/components/compare/CompareSinceChart', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="compare-since-chart" />,
  };
});
jest.mock('../../src/components/CalendarSheet', () => {
  const ReactModule: typeof import('react') = require('react');
  const { View }: typeof import('react-native') = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (props: Record<string, unknown>, ref: React.Ref<unknown>) => {
        ReactModule.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return ReactModule.createElement(View, {
          testID: 'since-calendar',
          ...props,
        });
      }
    ),
  };
});

const SUGGESTION: CompareQuestion = {
  a: 'timeAsleep',
  b: 'energy',
  choice: 'sameDay',
};

const okResponse = {
  a: { key: 'timeAsleep', values: {} },
  b: { key: 'energy', values: {} },
  through: '2026-10-21',
  deviations: { a: {}, b: {} },
  result: {
    status: 'ok',
    n: 62,
    needed: 14,
    method: 'pearson',
    linked: true,
    strength: 'moderate',
    sign: 'positive',
    r: 0.31,
    p: 0.012,
    low: 0.1,
    high: 0.5,
    checks: { ownNormal: true },
  },
} as CompareResponse;

const idle = {
  data: undefined,
  isLoading: false,
  isError: false,
  serverTooOld: false,
  refetch: jest.fn(),
};

const SINCE: CompareQuestion = {
  a: 'meditated',
  b: 'mood',
  choice: 'sinceHabit',
};

function sinceResponse(
  result: Partial<CompareSinceResult> = {}
): CompareSinceResponse {
  return {
    mode: 'since',
    habit: { key: 'meditated', values: {} },
    outcome: { key: 'mood', values: {} },
    result: {
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
        p90: 72,
        shareAtOrAbove: 0.38,
      },
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
      ...result,
    },
  };
}

const NO_START: Partial<CompareSinceResult> = {
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
};

/** Asks the meditated → mood suggestion, then turns it into a since question. */
function askSince() {
  fireEvent.press(
    screen.getByTestId('compare-suggestion-meditated-mood-sameDay')
  );
  fireEvent.press(screen.getByLabelText(/^When:/));
  fireEvent.press(screen.getByText('Before vs. since'));
}

const renderScreen = () =>
  render(
    <CompareReportScreen
      {...({
        navigation: { navigate: jest.fn(), goBack: jest.fn() },
        route: { params: undefined },
      } as never)}
    />
  );

describe('CompareReportScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    mockUseCompare.mockReset();
    mockUseCompare.mockReturnValue(idle);
    mockUseCompareSince.mockReset();
    mockUseCompareSince.mockReturnValue(idle);
  });

  it('opens on the start state', () => {
    const { getByText, queryByTestId } = renderScreen();
    expect(getByText('Try one of these')).toBeTruthy();
    expect(queryByTestId('compare-chart')).toBeNull();
  });

  it('asks the suggested question over the 90-day day window', () => {
    const { getByTestId, queryByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(mockUseCompare).toHaveBeenLastCalledWith(
      SUGGESTION,
      compareWindow('90d', 'day', getTodayDate())
    );
    expect(queryByText('Try one of these')).toBeNull();
  });

  it('switches to the week default when a week choice is picked, keeping each mode span', () => {
    const { getByTestId, getByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    fireEvent.press(getByText('30 days'));
    expect(mockUseCompare).toHaveBeenLastCalledWith(
      SUGGESTION,
      compareWindow('30d', 'day', getTodayDate())
    );
    fireEvent.press(screen.getByLabelText(/^When:/));
    fireEvent.press(getByText('The same week'));
    expect(mockUseCompare).toHaveBeenLastCalledWith(
      { ...SUGGESTION, choice: 'sameWeek' },
      compareWindow('6m', 'week', getTodayDate())
    );
    fireEvent.press(screen.getByLabelText(/^When:/));
    fireEvent.press(getByText('The same day'));
    expect(mockUseCompare).toHaveBeenLastCalledWith(
      SUGGESTION,
      compareWindow('30d', 'day', getTodayDate())
    );
  });

  it('drops the span control and the day/week answer in since mode, keeping the day span for the way back', () => {
    mockUseCompare.mockReturnValue({ ...idle, data: okResponse });
    const add = jest.fn();
    useAppPreferencesStore.setState({ addCompareRecentQuestion: add });
    const { getByTestId, getByText, queryByText, queryByTestId } =
      renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    fireEvent.press(getByText('30 days'));
    add.mockClear();

    fireEvent.press(screen.getByLabelText(/^When:/));
    fireEvent.press(getByText('Before vs. since'));
    expect(screen.getByLabelText('When: Since')).toBeTruthy();
    expect(queryByText('30 days')).toBeNull();
    expect(queryByText('Yes, a moderate link')).toBeNull();
    expect(queryByTestId('compare-chart')).toBeNull();
    expect(queryByText('Try one of these')).toBeNull();
    expect(add).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText(/^When:/));
    fireEvent.press(getByText('The same day'));
    expect(mockUseCompare).toHaveBeenLastCalledWith(
      SUGGESTION,
      compareWindow('30d', 'day', getTodayDate())
    );
  });

  it('shows a spinner while the answer loads', () => {
    mockUseCompare.mockReturnValue({ ...idle, isLoading: true });
    const { getByTestId } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(getByTestId('compare-loading')).toBeTruthy();
  });

  it('renders the answer, chart and checks for an ok response', () => {
    mockUseCompare.mockReturnValue({ ...idle, data: okResponse });
    const { getByTestId, getByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(getByText('Yes, a moderate link')).toBeTruthy();
    expect(getByTestId('compare-chart')).toBeTruthy();
    expect(getByText('A link, not proof of cause')).toBeTruthy();
  });

  it('tells the person to update an older server', () => {
    mockUseCompare.mockReturnValue({ ...idle, serverTooOld: true });
    const { getByTestId, getByText, queryByTestId } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(
      getByText(
        'Compare needs a newer SparkyFitness server. Update your server to use it.'
      )
    ).toBeTruthy();
    expect(queryByTestId('compare-chart')).toBeNull();
  });

  it('shows the generic error with a retry', () => {
    const refetch = jest.fn();
    mockUseCompare.mockReturnValue({ ...idle, isError: true, refetch });
    const { getByTestId, getByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    fireEvent.press(getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('adds each distinct loaded question to the recents once', () => {
    const add = jest.fn();
    useAppPreferencesStore.setState({ addCompareRecentQuestion: add });
    mockUseCompare.mockReturnValue({ ...idle, data: okResponse });
    const { getByTestId, getByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenLastCalledWith(SUGGESTION);

    // A span change refetches the same question and hands back fresh data: no second call.
    mockUseCompare.mockReturnValue({ ...idle, data: { ...okResponse } });
    fireEvent.press(getByText('30 days'));
    expect(add).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText(/^When:/));
    fireEvent.press(getByText('The next day'));
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenLastCalledWith({ ...SUGGESTION, choice: 'nextDay' });
  });

  it('keeps the answer on screen when a refresh fails', () => {
    mockUseCompare.mockReturnValue({
      ...idle,
      data: okResponse,
      isError: true,
    });
    const { getByTestId, getByText, queryByText } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(getByText('Yes, a moderate link')).toBeTruthy();
    expect(getByTestId('compare-chart')).toBeTruthy();
    expect(queryByText("Couldn't load this comparison.")).toBeNull();
  });

  it('skips a stored recent question this build does not know', () => {
    useAppPreferencesStore.setState({
      compareRecentQuestions: [
        { a: 'vo2max', b: 'energy', choice: 'sameDay' },
        { a: 'mood', b: 'energy', choice: 'someday' },
        { a: 'mood', b: 'energy', choice: 'sameDay' },
      ] as unknown as CompareQuestion[],
    });
    const { getByText, getAllByTestId } = renderScreen();
    expect(getByText('Your recent questions')).toBeTruthy();
    expect(getAllByTestId(/^compare-recent-/)).toHaveLength(1);
    expect(getByText('Does mood go with energy the same day?')).toBeTruthy();
  });

  it('does not record a question that has no answer yet', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(
      getByTestId('compare-suggestion-timeAsleep-energy-sameDay')
    );
    expect(useAppPreferencesStore.getState().compareRecentQuestions).toEqual(
      []
    );
  });

  describe('since a habit started', () => {
    it('switches to the since layout: rows, card and chart in place of the span, answer and checks', () => {
      mockUseCompare.mockReturnValue({ ...idle, data: okResponse });
      mockUseCompareSince.mockReturnValue({ ...idle, data: sinceResponse() });
      renderScreen();
      fireEvent.press(
        screen.getByTestId('compare-suggestion-meditated-mood-sameDay')
      );
      expect(screen.getByText('30 days')).toBeTruthy();
      expect(screen.queryByTestId('compare-since-rows')).toBeNull();

      fireEvent.press(screen.getByLabelText(/^When:/));
      fireEvent.press(screen.getByText('Before vs. since'));

      expect(mockUseCompareSince).toHaveBeenLastCalledWith(SINCE, null, null);
      expect(screen.getByTestId('compare-since-rows')).toBeTruthy();
      expect(screen.getByText('Yes, it changed')).toBeTruthy();
      expect(screen.getByTestId('compare-since-chart')).toBeTruthy();
      expect(screen.queryByText('30 days')).toBeNull();
      expect(screen.queryByTestId('compare-chart')).toBeNull();
      expect(screen.queryByText('A link, not proof of cause')).toBeNull();
    });

    it('shows the suggested start labelled as suggested, and a picked date refetches', () => {
      mockUseCompareSince.mockReturnValue({ ...idle, data: sinceResponse() });
      renderScreen();
      askSince();
      expect(screen.getByText('Apr 1, 2026')).toBeTruthy();
      expect(screen.getByText('(suggested)')).toBeTruthy();

      const today = getTodayDate();
      const calendar = screen.getByTestId('since-calendar');
      expect(calendar.props.minDate).toBe(addDays(today, -730));
      expect(calendar.props.maxDate).toBe(addDays(today, -1));

      const picked = addDays(today, -100);
      act(() => calendar.props.onSelectDate(picked));
      expect(mockUseCompareSince).toHaveBeenLastCalledWith(SINCE, picked, null);
      expect(screen.queryByText('(suggested)')).toBeNull();
    });

    it('refetches with the picked line in the stored scale', () => {
      mockUseCompareSince.mockReturnValue({ ...idle, data: sinceResponse() });
      renderScreen();
      askSince();
      expect(screen.getByLabelText('Mood at or above: 7.0')).toBeTruthy();
      fireEvent.press(screen.getByRole('radio', { name: '8.0' }));
      expect(mockUseCompareSince).toHaveBeenLastCalledWith(SINCE, null, 80);
    });

    it('prompts for a date when the server has no suggestion', () => {
      mockUseCompareSince.mockReturnValue({
        ...idle,
        data: sinceResponse(NO_START),
      });
      renderScreen();
      askSince();
      expect(screen.getByText('Pick a date')).toBeTruthy();
      expect(screen.queryByText('(suggested)')).toBeNull();
      expect(screen.getByText('Pick the day you started')).toBeTruthy();
      expect(screen.queryByText(/^Line/)).toBeNull();
    });

    it('keeps the rows while a new line loads', () => {
      mockUseCompareSince.mockReturnValue({ ...idle, data: sinceResponse() });
      renderScreen();
      askSince();
      mockUseCompareSince.mockReturnValue({ ...idle, isLoading: true });
      fireEvent.press(screen.getByRole('radio', { name: '8.0' }));
      expect(screen.getByTestId('compare-loading')).toBeTruthy();
      expect(screen.getByText('(suggested)')).toBeTruthy();
      expect(screen.getByLabelText('Mood at or above: 8.0')).toBeTruthy();
    });

    it('forgets the picked start when the habit changes and the line when the outcome does', () => {
      mockUseCompareSince.mockReturnValue({ ...idle, data: sinceResponse() });
      renderScreen();
      askSince();
      const picked = addDays(getTodayDate(), -100);
      act(() =>
        screen.getByTestId('since-calendar').props.onSelectDate(picked)
      );
      fireEvent.press(screen.getByRole('radio', { name: '8.0' }));
      expect(mockUseCompareSince).toHaveBeenLastCalledWith(SINCE, picked, 80);

      // Both metric pickers list every metric: [0] is the habit, [1] the outcome.
      fireEvent.press(screen.getAllByRole('radio', { name: 'Energy' })[1]);
      expect(mockUseCompareSince).toHaveBeenLastCalledWith(
        { ...SINCE, b: 'energy' },
        picked,
        null
      );

      fireEvent.press(
        screen.getAllByRole('radio', { name: 'Workout minutes' })[0]
      );
      expect(mockUseCompareSince).toHaveBeenLastCalledWith(
        { a: 'workoutMinutes', b: 'energy', choice: 'sinceHabit' },
        null,
        null
      );
    });

    it('shows a spinner while the answer loads', () => {
      mockUseCompareSince.mockReturnValue({ ...idle, isLoading: true });
      renderScreen();
      askSince();
      expect(screen.getByTestId('compare-loading')).toBeTruthy();
    });

    it('tells the person to update an older server', () => {
      mockUseCompareSince.mockReturnValue({ ...idle, serverTooOld: true });
      renderScreen();
      askSince();
      expect(
        screen.getByText(
          'Compare needs a newer SparkyFitness server. Update your server to use it.'
        )
      ).toBeTruthy();
      expect(screen.queryByTestId('compare-since-chart')).toBeNull();
    });

    it('shows the error with a retry', () => {
      const refetch = jest.fn();
      mockUseCompareSince.mockReturnValue({ ...idle, isError: true, refetch });
      renderScreen();
      askSince();
      fireEvent.press(screen.getByText('Retry'));
      expect(refetch).toHaveBeenCalled();
    });

    it('keeps the answer on screen when a refresh fails', () => {
      mockUseCompareSince.mockReturnValue({
        ...idle,
        isError: true,
        data: sinceResponse(),
      });
      renderScreen();
      askSince();
      expect(screen.getByText('Yes, it changed')).toBeTruthy();
      expect(screen.getByTestId('compare-since-chart')).toBeTruthy();
      expect(screen.queryByText("Couldn't load this comparison.")).toBeNull();
    });

    it('records a since question once, when it has an answer', () => {
      const add = jest.fn();
      useAppPreferencesStore.setState({ addCompareRecentQuestion: add });
      mockUseCompareSince.mockReturnValue({ ...idle, data: sinceResponse() });
      renderScreen();
      askSince();
      expect(add).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenLastCalledWith(SINCE);

      // A new line refetches the same question: no second call.
      mockUseCompareSince.mockReturnValue({
        ...idle,
        data: sinceResponse({ line: 80 }),
      });
      fireEvent.press(screen.getByRole('radio', { name: '8.0' }));
      expect(add).toHaveBeenCalledTimes(1);
    });

    it('offers a stored since question as a recent and asks it', () => {
      useAppPreferencesStore.setState({ compareRecentQuestions: [SINCE] });
      renderScreen();
      const recent = screen.getByText(
        'Since I started meditating regularly, has mood changed?'
      );
      fireEvent.press(recent);
      expect(mockUseCompareSince).toHaveBeenLastCalledWith(SINCE, null, null);
    });
  });
});
