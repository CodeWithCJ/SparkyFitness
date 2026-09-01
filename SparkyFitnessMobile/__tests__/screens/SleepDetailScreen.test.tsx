import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import SleepDetailScreen from '../../src/screens/SleepDetailScreen';
import { useSleepDetail } from '../../src/hooks/useSleepDetail';
import { initializeI18n } from '../../src/localization/i18n';
import { addDays, getTodayDate } from '../../src/utils/dateUtils';
import { buildSleepEntry, buildStageEvent } from '../helpers/sleepFixtures';

jest.mock('../../src/hooks/useSleepDetail', () => ({
  useSleepDetail: jest.fn(),
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

// Sleep times follow the account's 12h/24h `time_format`, same as diary food entries.
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: { time_format: 'h:mm A' } })),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/StatusView', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      loading,
      action,
    }: {
      title?: string;
      loading?: boolean;
      action?: { label: string; onPress: () => void };
    }) => (
      <View testID={loading ? 'status-view-loading' : 'status-view'}>
        <Text>{title}</Text>
        {action ? (
          <Pressable testID="status-action" onPress={action.onPress}>
            <Text>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  };
});

const mockUseSleepDetail = useSleepDetail as jest.MockedFunction<
  typeof useSleepDetail
>;

const DAY = '2026-08-23';
const ENTRY_ID = 'entry-main';

type DetailResult = ReturnType<typeof useSleepDetail>;

const setupScreen = (overrides: Partial<DetailResult> = {}) => {
  const entry = buildSleepEntry({ id: ENTRY_ID });
  mockUseSleepDetail.mockReturnValue({
    entry,
    stages: [buildStageEvent()],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as DetailResult);

  const route = { params: { entryId: ENTRY_ID, day: DAY } };
  return render(
    <SleepDetailScreen
      {...({ route, navigation: { navigate: jest.fn() } } as never)}
    />
  );
};

describe('SleepDetailScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders header, hypnogram, breakdown and biometrics for a full entry', () => {
    const { getByTestId, queryByTestId } = setupScreen();

    expect(getByTestId('sleep-detail-header')).toBeTruthy();
    expect(getByTestId('hypnogram')).toBeTruthy();
    expect(getByTestId('sleep-stages-breakdown')).toBeTruthy();
    expect(getByTestId('sleep-biometrics')).toBeTruthy();
    // Sleep debt is desktop-report territory and must not appear here.
    expect(queryByTestId('sleep-debt')).toBeNull();
  });

  test('hides the biometrics block when SpO2 and resting HR are all null', () => {
    const { queryByTestId, getByTestId } = setupScreen({
      entry: buildSleepEntry({
        id: ENTRY_ID,
        average_spo2_value: null,
        lowest_spo2_value: null,
        highest_spo2_value: null,
        resting_heart_rate: null,
      }),
    });

    expect(queryByTestId('sleep-biometrics')).toBeNull();
    // The rest of the screen is unaffected.
    expect(getByTestId('sleep-detail-header')).toBeTruthy();
  });

  test('renders only the resting-HR row when SpO2 is absent but HR is present', () => {
    const { getByTestId, queryByTestId } = setupScreen({
      entry: buildSleepEntry({
        id: ENTRY_ID,
        average_spo2_value: null,
        lowest_spo2_value: null,
        highest_spo2_value: null,
        resting_heart_rate: 52,
      }),
    });

    expect(getByTestId('sleep-biometrics')).toBeTruthy();
    expect(getByTestId('sleep-biometric-restingHeartRate')).toBeTruthy();
    expect(queryByTestId('sleep-biometric-averageSpo2')).toBeNull();
    expect(queryByTestId('sleep-biometric-lowestSpo2')).toBeNull();
    expect(queryByTestId('sleep-biometric-highestSpo2')).toBeNull();
  });

  test('leads the content with a Sleep title and the session’s date', () => {
    const { getByText, getByTestId } = setupScreen({
      entry: buildSleepEntry({ id: ENTRY_ID, entry_date: '2026-08-23' }),
    });

    expect(getByText('Sleep')).toBeTruthy();
    expect(getByTestId('sleep-detail-date').props.children).toBe('Sun, Aug 23');
  });

  test('renders the title and date outside the summary card, not within it', () => {
    // They sit on the page background like FoodNutritionSummary's name/brand, so the
    // date must not be a descendant of the card.
    const { getByTestId } = setupScreen();

    const card = getByTestId('sleep-detail-header');
    const collectTestIDs = (node: {
      props?: Record<string, unknown>;
      children?: unknown[];
    }): string[] => {
      const own =
        typeof node?.props?.testID === 'string' ? [node.props.testID] : [];
      const kids = (node?.children ?? []).flatMap((child) =>
        typeof child === 'string' ? [] : collectTestIDs(child as never)
      );
      return [...own, ...kids];
    };

    expect(collectTestIDs(card as never)).not.toContain('sleep-detail-date');
    expect(getByTestId('sleep-detail-date')).toBeTruthy();
  });

  test('resolves the date to Today and Yesterday like the meal-type screens', () => {
    const today = getTodayDate();

    const todayScreen = setupScreen({
      entry: buildSleepEntry({ id: ENTRY_ID, entry_date: today }),
    });
    expect(todayScreen.getByTestId('sleep-detail-date').props.children).toBe(
      'Today'
    );

    const yesterdayScreen = setupScreen({
      entry: buildSleepEntry({ id: ENTRY_ID, entry_date: addDays(today, -1) }),
    });
    expect(
      yesterdayScreen.getByTestId('sleep-detail-date').props.children
    ).toBe('Yesterday');
  });

  test('shows the loading status view without crashing on a null entry', () => {
    const { getByTestId } = setupScreen({
      entry: null,
      stages: [],
      isLoading: true,
    });

    expect(getByTestId('status-view-loading')).toBeTruthy();
  });

  test('shows an empty state rather than a blank screen when the entry is not found', () => {
    const { getByText, queryByTestId } = setupScreen({
      entry: null,
      stages: [],
      isLoading: false,
    });

    expect(getByText('Sleep entry not found')).toBeTruthy();
    expect(queryByTestId('sleep-detail-header')).toBeNull();
  });

  test('separates a failed load from a missing entry, and offers a retry', () => {
    // "May have been removed" is both wrong and a dead end when the request simply
    // failed, so the error case gets its own copy plus the refetch as its action.
    const refetch = jest.fn();
    const { getByText, getByTestId, queryByText } = setupScreen({
      entry: null,
      stages: [],
      isError: true,
      refetch,
    });

    expect(getByText('Could not load this sleep session')).toBeTruthy();
    expect(queryByText('Sleep entry not found')).toBeNull();

    fireEvent.press(getByTestId('status-action'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('offers no retry for a not-found entry, which refetching cannot fix', () => {
    const { getByText, queryByTestId } = setupScreen({
      entry: null,
      stages: [],
      isError: false,
    });

    expect(getByText('Sleep entry not found')).toBeTruthy();
    expect(queryByTestId('status-action')).toBeNull();
  });

  test('omits the score from the header when sleep_score is null', () => {
    const { queryByTestId, queryByText, getByText } = setupScreen({
      entry: buildSleepEntry({ id: ENTRY_ID, sleep_score: null }),
    });

    expect(queryByTestId('sleep-score')).toBeNull();
    expect(queryByText('null')).toBeNull();
    expect(queryByText('NaN')).toBeNull();
    // Time asleep is still shown.
    expect(getByText('7h 30m')).toBeTruthy();
  });

  test('falls back to the hypnogram empty state while the breakdown still renders', () => {
    const { getByTestId, queryByTestId } = setupScreen({ stages: [] });

    expect(getByTestId('hypnogram-empty')).toBeTruthy();
    expect(queryByTestId('hypnogram')).toBeNull();
    // The breakdown reads the aggregate columns, so it survives having no stage events.
    expect(getByTestId('sleep-stages-breakdown')).toBeTruthy();
  });
});
