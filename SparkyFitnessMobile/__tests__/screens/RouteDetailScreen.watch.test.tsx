import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import RouteDetailScreen from '../../src/screens/RouteDetailScreen';
import { useWatchConnectivity } from '../../src/hooks/useWatchConnectivity';
import { useWatchRouteStore } from '../../src/stores/watchRouteStore';
import {
  removeRouteFromWatch,
  sendRouteToWatch,
} from '../../src/services/watchRouteSync';
import { startRunOnWatch } from '../../src/services/watchRunControl';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

const savedRoute = {
  id: 'r1',
  name: 'Hill loop',
  activity: 'run',
  source: 'drawn',
  distanceM: 5000,
  elevationGainM: null,
  points: [
    { lat: 51.5, lon: -0.12 },
    { lat: 51.51, lon: -0.12 },
  ],
  cues: [],
  sourceExerciseEntryId: null,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
};
const REV = Date.parse(savedRoute.updatedAt);

jest.mock('../../src/services/routeService', () => ({
  useRoute: jest.fn(() => ({
    route: savedRoute,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  })),
  removeRoute: jest.fn(() => Promise.resolve()),
  renameRoute: jest.fn(() => Promise.resolve()),
  shareRouteGpx: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/hooks/useWatchConnectivity', () => ({
  useWatchConnectivity: jest.fn(),
}));
jest.mock('../../src/services/watchRouteSync', () => ({
  sendRouteToWatch: jest.fn(() => Promise.resolve()),
  removeRouteFromWatch: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/watchRunControl', () => ({
  startRunOnWatch: jest.fn(() => Promise.resolve('q1')),
}));
jest.mock('../../src/services/gpsRecordingService', () => ({
  getRecordingPreferences: jest.fn(() =>
    Promise.resolve({ autoPause: true, audioCues: true })
  ),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/components/exerciseStats/RouteMap', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const paired = (isPaired: boolean) =>
  jest.mocked(useWatchConnectivity).mockReturnValue({
    isSupported: true,
    isPaired,
    isReachable: true,
  });
const record = (
  sent: Record<string, number>,
  reported: Record<string, number> | null,
  rejected: Record<string, 'full' | 'storage'> = {}
) => useWatchRouteStore.setState({ sent, reported, rejected });

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const props = {
  navigation,
  route: { key: 'RouteDetail', name: 'RouteDetail', params: { id: 'r1' } },
} as unknown as RootStackScreenProps<'RouteDetail'>;

const renderScreen = () => render(<RouteDetailScreen {...props} />);

describe('RouteDetailScreen watch controls', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    paired(true);
    record({}, null);
  });

  describe('send and remove', () => {
    it('shows nothing about the watch without a paired watch', () => {
      paired(false);
      const screen = renderScreen();
      expect(screen.queryByText('Send to watch')).toBeNull();
      expect(screen.queryByText('Remove from watch')).toBeNull();
    });

    it('offers Send to watch for a route that was never sent', async () => {
      const screen = renderScreen();
      expect(screen.queryByText('Remove from watch')).toBeNull();
      fireEvent.press(screen.getByText('Send to watch'));
      await waitFor(() =>
        expect(sendRouteToWatch).toHaveBeenCalledWith(savedRoute)
      );
    });

    it('says it is waiting for the watch after a send', () => {
      record({ r1: REV }, null);
      const screen = renderScreen();
      expect(screen.getByTestId('route-watch-status').props.children).toBe(
        'Sent. Waiting for your watch to confirm.'
      );
      expect(screen.getByText('Remove from watch')).toBeTruthy();
    });

    it('says On your watch once the watch reports it, and offers Remove', async () => {
      record({ r1: REV }, { r1: REV });
      const screen = renderScreen();
      expect(screen.getByTestId('route-watch-status').props.children).toBe(
        'On your watch'
      );
      expect(screen.queryByText('Send to watch')).toBeNull();
      expect(screen.queryByText('Send again')).toBeNull();
      fireEvent.press(screen.getByText('Remove from watch'));
      await waitFor(() =>
        expect(removeRouteFromWatch).toHaveBeenCalledWith('r1')
      );
    });

    it('says Out of date after an edit and offers Send again', async () => {
      // The watch holds the revision before the phone's edit.
      record({ r1: REV - 5000 }, { r1: REV - 5000 });
      const screen = renderScreen();
      expect(screen.getByTestId('route-watch-status').props.children).toBe(
        'Out of date, send again'
      );
      fireEvent.press(screen.getByText('Send again'));
      await waitFor(() => expect(sendRouteToWatch).toHaveBeenCalled());
      expect(screen.getByText('Remove from watch')).toBeTruthy();
    });

    it('explains a full watch', () => {
      record({ r1: REV }, {}, { r1: 'full' });
      const screen = renderScreen();
      expect(screen.getByTestId('route-watch-status').props.children).toMatch(
        /Your watch is full/
      );
      expect(screen.getByText('Send again')).toBeTruthy();
    });

    it('does not send again by itself when the route changes', () => {
      record({ r1: REV - 5000 }, { r1: REV - 5000 });
      renderScreen();
      expect(sendRouteToWatch).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('offers no Start without a paired watch', () => {
      paired(false);
      const screen = renderScreen();
      expect(screen.queryByText('Start on watch')).toBeNull();
      expect(startRunOnWatch).not.toHaveBeenCalled();
    });

    it('asks Run or Walk and starts the route on the watch', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const screen = renderScreen();
      fireEvent.press(screen.getByText('Start on watch'));
      const buttons = alert.mock.calls[0][2] ?? [];
      const run = buttons.find((button) => button.text === 'Run');
      await act(async () => {
        run?.onPress?.();
      });
      await waitFor(() =>
        expect(startRunOnWatch).toHaveBeenCalledWith({
          kind: 'run',
          place: 'outdoor',
          autoPause: true,
          voiceCues: true,
          route: savedRoute,
        })
      );
      await waitFor(() =>
        expect(navigation.navigate).toHaveBeenCalledWith('WatchRunLive')
      );
      alert.mockRestore();
    });

    it('starts a walk when Walk is chosen', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const screen = renderScreen();
      fireEvent.press(screen.getByText('Start on watch'));
      const walk = (alert.mock.calls[0][2] ?? []).find(
        (button) => button.text === 'Walk'
      );
      await act(async () => {
        walk?.onPress?.();
      });
      await waitFor(() =>
        expect(startRunOnWatch).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'walk', place: 'outdoor' })
        )
      );
      alert.mockRestore();
    });
  });
});
