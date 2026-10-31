import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SymptomEntryResponse } from '@workspace/shared';
import SymptomHistoryScreen from '../../src/screens/SymptomHistoryScreen';
import {
  useOngoingEpisodes,
  useSymptomActions,
  useSymptomDefinitions,
  useSymptomEntriesDetailed,
  useSymptomFreeDays,
} from '../../src/hooks/useSymptoms';
import { usePreferences } from '../../src/hooks/usePreferences';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'SymptomHistory'>;

jest.mock('../../src/hooks/useSymptoms', () => ({
  useOngoingEpisodes: jest.fn(),
  useSymptomActions: jest.fn(),
  useSymptomDefinitions: jest.fn(),
  useSymptomEntriesDetailed: jest.fn(),
  useSymptomFreeDays: jest.fn(),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
  useNativeIOSTabsActive: () => false,
}));

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockEntriesDetailed = useSymptomEntriesDetailed as jest.MockedFunction<
  typeof useSymptomEntriesDetailed
>;

const entry = (fields: Partial<SymptomEntryResponse>) =>
  ({
    started_at: null,
    ended_at: null,
    severity: 8,
    peak_severity: 8,
    source: 'manual',
    triggers: [],
    treatments: [],
    ...fields,
  }) as SymptomEntryResponse;

// Both are filed in October, which is all an older server returns for the
// month: the migraine ran from the 12th to the 14th, the nausea is still going.
const migraine = entry({
  id: 'migraine',
  symptom_name_snapshot: 'Migraine',
  entry_date: '2026-10-12',
  started_at: '2026-10-12T21:00:00.000Z',
  ended_at: '2026-10-14T09:00:00.000Z',
});
const nausea = entry({
  id: 'nausea',
  symptom_name_snapshot: 'Nausea',
  entry_date: '2026-10-27',
  started_at: '2026-10-27T10:00:00.000Z',
  severity: 4,
  peak_severity: 4,
});

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <SymptomHistoryScreen
        navigation={mockNavigation}
        route={{
          key: 'SymptomHistory',
          name: 'SymptomHistory',
          params: undefined,
        }}
      />
    </SafeAreaProvider>
  );

describe('SymptomHistoryScreen day list', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Today is 29 October 2026 in UTC, the profile timezone.
    jest.useFakeTimers({ now: new Date('2026-10-29T12:00:00.000Z') });
    (usePreferences as jest.Mock).mockReturnValue({
      preferences: { timezone: 'UTC' },
    });
    // Answers like a server that ignores `overlapping`: only the entries
    // filed in the range asked for.
    mockEntriesDetailed.mockImplementation(
      ({ fromDate, toDate }) =>
        ({
          entries: [migraine, nausea].filter(
            (e) => e.entry_date >= fromDate && e.entry_date <= toDate
          ),
          isLoading: false,
          refetch: jest.fn(),
        }) as unknown as ReturnType<typeof useSymptomEntriesDetailed>
    );
    (useOngoingEpisodes as jest.Mock).mockReturnValue({
      episodes: [],
      isLoading: false,
    });
    (useSymptomDefinitions as jest.Mock).mockReturnValue({ definitions: [] });
    (useSymptomFreeDays as jest.Mock).mockReturnValue({
      freeDays: [],
      isLoading: false,
    });
    (useSymptomActions as jest.Mock).mockReturnValue({
      markFree: { mutate: jest.fn() },
      unmarkFree: { mutate: jest.fn() },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lists an episode on a later day it covers, from the month the calendar shows', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('2026-10-13, Severe'));

    expect(screen.getByText('Migraine')).toBeTruthy();
    expect(screen.queryByText('Nausea')).toBeNull();
    // The day comes from the month query, not a query for that day alone,
    // which an older server would answer with nothing.
    expect(mockEntriesDetailed).not.toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: '2026-10-13' })
    );
  });

  it('lists an episode still going on today but not on the day after', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('2026-10-29, Mild to moderate'));
    expect(screen.getByText('Nausea')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('2026-10-30'));
    expect(screen.queryByText('Nausea')).toBeNull();
    expect(
      screen.getByText('No symptoms were logged on this day.')
    ).toBeTruthy();
  });

  it('keeps the plain 30-day list until a day is tapped', () => {
    renderScreen();
    expect(mockEntriesDetailed).toHaveBeenCalledWith({
      fromDate: '2026-09-30',
      toDate: '2026-10-29',
      overlapping: false,
    });
  });
});
