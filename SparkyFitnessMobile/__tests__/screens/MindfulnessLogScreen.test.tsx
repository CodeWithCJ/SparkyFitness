import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MindfulnessSessionResponse } from '@workspace/shared';
import MindfulnessLogScreen from '../../src/screens/MindfulnessLogScreen';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'MindfulnessLog'>;

const mockSaveSession = jest.fn();
const mockUpdateSession = jest.fn();
jest.mock('../../src/hooks/useMindfulness', () => ({
  useMindfulnessMutations: () => ({
    saveSession: mockSaveSession,
    updateSession: mockUpdateSession,
  }),
}));

// The Android layout: header and sticky Save drawn by the screen itself.
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  ...jest.requireActual('../../src/services/nativeTabBarPreference'),
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

// Paced Breathing and the Meditation Timer, reduced to what the screen hands
// them: whether they are open, and the save they call when finished.
type PracticeSave = (seconds: number, sessionType: string) => Promise<void>;
const mockPractice: Record<'breathwork' | 'timer', PracticeSave | null> = {
  breathwork: null,
  timer: null,
};
// A function declaration, so the hoisted jest.mock factories below can call
// it when the screen renders a practice.
function mockPracticeModal(
  kind: 'breathwork' | 'timer',
  { visible, onSave }: { visible: boolean; onSave: PracticeSave }
) {
  const { View } = require('react-native');
  mockPractice[kind] = onSave;
  return visible ? <View testID={`${kind}-modal`} /> : null;
}
jest.mock('../../src/components/mindfulness/BreathworkModal', () => ({
  BreathworkModal: (props: { visible: boolean; onSave: PracticeSave }) =>
    mockPracticeModal('breathwork', props),
}));
jest.mock('../../src/components/mindfulness/MeditationTimerModal', () => ({
  MeditationTimerModal: (props: { visible: boolean; onSave: PracticeSave }) =>
    mockPracticeModal('timer', props),
}));

const mockIsFocused = jest.fn(() => true);
const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  isFocused: mockIsFocused,
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const DATE = '2026-10-14';
const frame = { x: 0, y: 0, width: 390, height: 844 };

/** Roughly what Android reports under edge-to-edge with 3-button navigation. */
const ANDROID_INSETS = { top: 24, bottom: 48, left: 0, right: 0 };

const renderScreen = (params: ScreenProps['route']['params']) =>
  render(
    <SafeAreaProvider initialMetrics={{ insets: ANDROID_INSETS, frame }}>
      <MindfulnessLogScreen
        navigation={mockNavigation}
        route={{ key: 'MindfulnessLog-key', name: 'MindfulnessLog', params }}
      />
    </SafeAreaProvider>
  );

/** The padding the nearest ancestor of `text` sets on `side`. */
const paddingAbove = (
  text: string,
  side: 'paddingTop' | 'paddingBottom'
): number | undefined => {
  let node = screen.getByText(text).parent;
  while (node) {
    const style = node.props?.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    if (typeof flat?.[side] === 'number') return flat[side];
    node = node.parent;
  }
  return undefined;
};

const session: MindfulnessSessionResponse = {
  id: 'session-1',
  user_id: 'user-1',
  entry_date: DATE,
  start_time: null,
  end_time: null,
  duration_seconds: 600,
  session_type: 'yoga',
  provider: 'manual',
  external_id: null,
  heart_rate_avg: 62,
  heart_rate_start: null,
  heart_rate_end: null,
  hrv_rmssd: null,
  stress_level_start: null,
  stress_level_end: null,
  mood_entry_id: null,
  notes: 'calm',
  created_at: '2026-10-14T08:00:00.000Z',
  updated_at: '2026-10-14T08:00:00.000Z',
};

describe('MindfulnessLogScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveSession.mockResolvedValue(undefined);
    mockUpdateSession.mockResolvedValue(undefined);
    mockIsFocused.mockReturnValue(true);
  });

  it('logs a new session on the date it was opened for, then closes', async () => {
    renderScreen({ date: DATE });

    expect(screen.getByText('Log Mindful Session')).toBeTruthy();
    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('Save');
    expect(mockSaveSession).toHaveBeenCalledWith({
      entry_date: DATE,
      duration_seconds: 15 * 60,
      session_type: 'meditation',
      provider: 'manual',
      notes: null,
      heart_rate_avg: null,
      heart_rate_start: null,
      heart_rate_end: null,
      hrv_rmssd: null,
    });
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('edits the session it was opened with', async () => {
    renderScreen({ date: DATE, session });

    expect(screen.getByText('Edit Mindful Session')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Duration in minutes'), '20');
    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('Save');
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockUpdateSession).toHaveBeenCalledWith('session-1', {
      duration_seconds: 20 * 60,
      session_type: 'yoga',
      notes: 'calm',
      heart_rate_avg: 62,
      heart_rate_start: null,
      heart_rate_end: null,
      hrv_rmssd: null,
    });
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('offers each session type with its icon and saves the one picked', async () => {
    renderScreen({ date: DATE });

    for (const label of [
      '🧘 Meditation',
      '🌊 Breathwork',
      '🪞 Reflection',
      '🚶 Mindful Walking',
      '🧘‍♀️ Yoga',
      '🎧 Guided',
      '🕯️ Unguided',
      '✨ Other',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }

    fireEvent.press(screen.getByText('🧘‍♀️ Yoga'));
    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('Save');
    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({ session_type: 'yoga' })
    );
  });

  it.each(['sound_bath', ''])(
    'shows the stored type %p as Other and keeps it on save',
    async (storedType) => {
      // Another client or an import can store a type the chips do not have.
      renderScreen({
        date: DATE,
        session: { ...session, session_type: storedType },
      });

      expect(
        screen.getByRole('button', { name: '✨ Other', selected: true })
      ).toBeTruthy();
      // Pressing the Other chip already shown is not picking another type.
      fireEvent.press(screen.getByText('✨ Other'));
      fireEvent.press(screen.getByText('Save'));

      await screen.findByText('Save');
      expect(mockUpdateSession).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ session_type: storedType })
      );
    }
  );

  it.each([
    ['breathwork', 'Paced Breathing'],
    ['timer', 'Meditation Timer'],
  ] as const)(
    'keeps the %s practice open with its session when the save fails',
    async (kind, launch) => {
      // The practice resets and closes only when its save resolves, so a
      // failure must reach it as a rejection, not just as a toast.
      mockSaveSession.mockRejectedValue(new Error('offline'));
      renderScreen({ date: DATE });
      fireEvent.press(screen.getByText(launch));

      await act(async () => {
        await expect(mockPractice[kind]!(300, kind)).rejects.toThrow('offline');
      });

      expect(screen.getByTestId(`${kind}-modal`)).toBeTruthy();
      expect(mockNavigation.goBack).not.toHaveBeenCalled();
    }
  );

  it('closes the practice and the screen once a practice session is saved', async () => {
    renderScreen({ date: DATE });
    fireEvent.press(screen.getByText('Paced Breathing'));

    await act(async () => {
      await mockPractice.breathwork!(300, 'breathwork');
    });

    expect(mockSaveSession).toHaveBeenCalledWith({
      entry_date: DATE,
      duration_seconds: 300,
      session_type: 'breathwork',
      provider: 'manual',
    });
    expect(screen.queryByTestId('breathwork-modal')).toBeNull();
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('closes from the header without saving', () => {
    renderScreen({ date: DATE });

    fireEvent.press(screen.getByLabelText('Cancel'));

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('does not save a session with no duration', () => {
    renderScreen({ date: DATE });

    fireEvent.changeText(screen.getByLabelText('Duration in minutes'), '0');
    fireEvent.press(screen.getByText('Save'));

    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('does not close the screen it was opened from when the save lands after leaving', async () => {
    // Cancel, Back or a swipe while the save was pending already closed this
    // screen; going back again would close MindfulnessDetail under it.
    mockIsFocused.mockReturnValue(false);
    renderScreen({ date: DATE, session });

    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('Save');
    expect(mockUpdateSession).toHaveBeenCalledTimes(1);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('keeps the header below the status bar and Save above the navigation bar on Android', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    renderScreen({ date: DATE });

    expect(paddingAbove('Log Mindful Session', 'paddingTop')).toBe(
      ANDROID_INSETS.top
    );
    expect(paddingAbove('Save', 'paddingBottom')).toBe(ANDROID_INSETS.bottom);
    osSpy.restore();
  });

  it('adds no top inset on iOS, where the sheet already starts below the status bar', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    renderScreen({ date: DATE });

    expect(paddingAbove('Log Mindful Session', 'paddingTop')).toBeUndefined();
    osSpy.restore();
  });
});
