import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import MindfulnessDetailScreen from '../../src/screens/MindfulnessDetailScreen';
import {
  useMindfulnessDay,
  useMindfulnessMutations,
} from '../../src/hooks/useMindfulness';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useMindfulness', () => ({
  useMindfulnessDay: jest.fn(),
  useMindfulnessMutations: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/hooks/useHeaderActionColors', () => ({
  useHeaderActionColors: () => ({
    backColor: '#111827',
    defaultColor: '#111827',
  }),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

describe('MindfulnessDetailScreen', () => {
  const mockNavigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  };

  const mockSaveSession = jest.fn();
  const mockUpdateSession = jest.fn();
  const mockDeleteSession = jest.fn();

  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (useMindfulnessDay as jest.Mock).mockReturnValue({
      sessions: [
        {
          id: 'session-1',
          user_id: 'user-1',
          entry_date: '2026-10-06',
          start_time: '2026-10-06T10:00:00Z',
          duration_seconds: 900,
          session_type: 'meditation',
          provider: 'manual',
          notes: 'Great calm',
          heart_rate_avg: 65,
          hrv_rmssd: 58,
        },
      ],
      totalMindfulMinutes: 15,
      isLoading: false,
    });
    (useMindfulnessMutations as jest.Mock).mockReturnValue({
      saveSession: mockSaveSession,
      updateSession: mockUpdateSession,
      deleteSession: mockDeleteSession,
      isSaving: false,
      isUpdating: false,
      isDeleting: false,
    });
  });

  it('renders correctly with practice tab and interactive practice tools', () => {
    const { getByText } = render(
      <MindfulnessDetailScreen
        navigation={mockNavigation as never}
        route={{ params: { selectedDate: '2026-10-06' } } as never}
      />
    );

    expect(getByText('Mindfulness')).toBeTruthy();
    expect(getByText('Paced Breathing')).toBeTruthy();
    expect(getByText('Meditation Timer')).toBeTruthy();
    expect(getByText('Log Mindful Session')).toBeTruthy();
  });

  it('switches to history tab and displays past sessions with edit and delete buttons', () => {
    const { getByText, getByLabelText } = render(
      <MindfulnessDetailScreen
        navigation={mockNavigation as never}
        route={{ params: { selectedDate: '2026-10-06' } } as never}
      />
    );

    // Switch to History tab
    const historyTab = getByText('History');
    fireEvent.press(historyTab);

    // Past session duration (900s = 15 min) and type
    expect(getByText('15 min')).toBeTruthy();
    expect(getByText('Meditation')).toBeTruthy();
    expect(getByText('Great calm')).toBeTruthy();

    expect(getByLabelText('Edit')).toBeTruthy();
    expect(getByLabelText('Delete')).toBeTruthy();
  });

  it('logs by hand through the shared log screen instead of a form of its own', () => {
    const { getByText, queryByText, queryByLabelText } = render(
      <MindfulnessDetailScreen
        navigation={mockNavigation as never}
        route={{ params: { selectedDate: '2026-10-06' } } as never}
      />
    );

    expect(queryByText('Save Mindful Session')).toBeNull();
    expect(queryByLabelText('Duration in minutes')).toBeNull();

    fireEvent.press(getByText('Log Mindful Session'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('MindfulnessLog', {
      date: '2026-10-06',
    });
  });

  it('edits a session from History in the shared log screen', () => {
    const { getByText, getByLabelText } = render(
      <MindfulnessDetailScreen
        navigation={mockNavigation as never}
        route={{ params: { selectedDate: '2026-10-06' } } as never}
      />
    );

    fireEvent.press(getByText('History'));
    fireEvent.press(getByLabelText('Edit'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('MindfulnessLog', {
      date: '2026-10-06',
      session: expect.objectContaining({ id: 'session-1' }),
    });
  });
});
