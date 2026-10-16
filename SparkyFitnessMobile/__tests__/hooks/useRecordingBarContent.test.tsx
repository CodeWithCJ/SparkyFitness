import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  renderHook,
} from '@testing-library/react-native';

import { useRecordingBarContent } from '../../src/hooks/useRecordingBarContent';
import {
  discardRecording,
  pauseRecording,
  resumeRecording,
  type RecordingSession,
} from '../../src/services/gpsRecordingService';
import { initializeI18n } from '../../src/localization/i18n';
import type { RecordedPoint } from '../../src/utils/gpsRecording';

jest.mock('../../src/services/gpsRecordingService', () => ({
  discardRecording: jest.fn(() => Promise.resolve()),
  pauseRecording: jest.fn(() => Promise.resolve()),
  resumeRecording: jest.fn(() => Promise.resolve()),
  elapsedSeconds: jest.fn(() => 754),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const DEG_PER_METER = 1 / 111_194.9;

const session = (
  overrides: Partial<RecordingSession> = {}
): RecordingSession => ({
  id: 'rec-1',
  activity: 'run',
  status: 'paused',
  startedAt: 1_000_000,
  finishedAt: null,
  pausedAt: 1_754_000,
  pausedMs: 0,
  seg: 0,
  savedEntryId: null,
  ...overrides,
});

// 2.5 km at 4 m/s.
const track: RecordedPoint[] = Array.from({ length: 11 }, (_, i) => ({
  t: 1_000_000 + i * 62_500,
  lat: 51.5 + i * 250 * DEG_PER_METER,
  lon: -0.12,
  alt: null,
  hacc: 5,
  vacc: null,
  speed: null,
  course: null,
  seg: 0,
}));

const onOpen = jest.fn();
const build = (
  current: RecordingSession | null,
  points: RecordedPoint[] = track
) =>
  renderHook(() =>
    useRecordingBarContent({
      session: current,
      points,
      distanceUnit: 'km',
      accentColor: '#00f',
      mutedColor: '#888',
      onOpen,
    })
  ).result.current;

const buttons = (content: NonNullable<ReturnType<typeof build>>) =>
  render(
    <>
      {content.leftButton}
      {content.rightButton}
    </>
  );

describe('useRecordingBarContent', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => jest.clearAllMocks());

  it('has nothing to show without a recording', () => {
    expect(build(null)).toBeNull();
  });

  it('shows the activity, clock, distance and pace for a paused recording', () => {
    const content = build(session())!;

    expect(content.topStatusLine).toBe('Paused');
    expect(content.primaryLine).toBe('Run');
    expect(content.countdownLabel).toBe('12:34');
    // 2.5 km in 625 s of fixes: 4 m/s => 4:10 per km.
    expect(content.secondaryLine).toBe('2.50 km · 4:10 /km');
    expect(content.openLabel).toBe('Open recording');
  });

  it('says it is waiting for GPS before the first stretch of track', () => {
    const content = build(session(), track.slice(0, 1))!;

    expect(content.secondaryLine).toBe('Waiting for a GPS fix…');
  });

  it('labels an indoor session as indoor, not as waiting for GPS', () => {
    const content = build(session({ indoor: true }), [])!;

    expect(content.secondaryLine).toBe('Indoor');
  });

  it('pauses a running recording from the bar', async () => {
    const content = build(session({ status: 'recording', pausedAt: null }))!;
    await act(async () => {});

    const screen = buttons(content);
    fireEvent.press(screen.getByLabelText('Pause'));

    expect(content.topStatusLine).toBe('Recording');
    expect(pauseRecording).toHaveBeenCalled();
  });

  it('resumes a paused recording from the bar', () => {
    const screen = buttons(build(session())!);

    fireEvent.press(screen.getByLabelText('Resume'));

    expect(resumeRecording).toHaveBeenCalled();
    expect(pauseRecording).not.toHaveBeenCalled();
  });

  it('asks before discarding, then discards', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = buttons(build(session())!);

    fireEvent.press(screen.getByLabelText('Discard recording'));
    expect(alert).toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();

    const confirm = alert.mock.calls[0][2]?.find(
      (button) => button.style === 'destructive'
    );
    await act(async () => {
      confirm?.onPress?.();
    });
    expect(discardRecording).toHaveBeenCalled();
  });

  it('points a finished recording at the screen to review and save it', () => {
    const content = build(
      session({ status: 'finished', finishedAt: 1_754_000 })
    )!;
    const screen = buttons(content);

    expect(content.topStatusLine).toBe('Finished');
    expect(content.secondaryLine).toBe('Tap to review and save');
    expect(screen.queryByLabelText('Pause')).toBeNull();
    expect(screen.queryByLabelText('Resume')).toBeNull();

    fireEvent.press(screen.getByLabelText('Review and save'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('opens the recording screen when the bar is tapped', () => {
    build(session())!.onCenterPress();

    expect(onOpen).toHaveBeenCalled();
  });
});
