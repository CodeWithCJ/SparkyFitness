import WatchConnectivity from '../../modules/watch-connectivity';
import {
  removeRouteFromWatch,
  sendRouteToWatch,
} from '../../src/services/watchRouteSync';
import { useWatchRouteStore } from '../../src/stores/watchRouteStore';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    sendRoute: jest.fn(() => Promise.resolve()),
    removeRoute: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const module = WatchConnectivity as unknown as {
  sendRoute: jest.Mock;
  removeRoute: jest.Mock;
};

const UPDATED = '2026-03-01T10:00:00.000Z';
const route = {
  id: 'r1',
  name: 'Loop',
  updatedAt: UPDATED,
  cues: [],
  points: [
    { lat: 51.5, lon: -0.12 },
    { lat: 51.501, lon: -0.12 },
    { lat: 51.501, lon: -0.118 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  useWatchRouteStore.setState({
    sent: {},
    reported: null,
    rejected: {},
    reportedAt: 0,
  });
});

describe('sendRouteToWatch', () => {
  it('queues the route with its revision and remembers it was sent', async () => {
    await sendRouteToWatch(route);
    expect(module.sendRoute).toHaveBeenCalledTimes(1);
    const sent = module.sendRoute.mock.calls[0][0];
    expect(sent.updatedAt).toBe(Date.parse(UPDATED));
    expect(sent.route).toEqual(
      expect.objectContaining({ id: 'r1', name: 'Loop' })
    );
    expect(useWatchRouteStore.getState().sent).toEqual({
      r1: Date.parse(UPDATED),
    });
  });

  it('refuses a route with no line and sends nothing', async () => {
    await expect(
      sendRouteToWatch({ ...route, points: route.points.slice(0, 1) })
    ).rejects.toThrow();
    expect(module.sendRoute).not.toHaveBeenCalled();
    expect(useWatchRouteStore.getState().sent).toEqual({});
  });

  it('does not remember a route the native send failed on', async () => {
    module.sendRoute.mockRejectedValueOnce(new Error('no session'));
    await expect(sendRouteToWatch(route)).rejects.toThrow('no session');
    expect(useWatchRouteStore.getState().sent).toEqual({});
  });
});

describe('removeRouteFromWatch', () => {
  it('sends nothing for a route the watch was never given', async () => {
    await removeRouteFromWatch('r1');
    expect(module.removeRoute).not.toHaveBeenCalled();
  });

  it('removes a route that was sent, and forgets it', async () => {
    useWatchRouteStore.setState({ sent: { r1: 1 } });
    await removeRouteFromWatch('r1');
    expect(module.removeRoute).toHaveBeenCalledWith('r1');
    expect(useWatchRouteStore.getState().sent).toEqual({});
  });

  it('removes a route only the watch reported', async () => {
    useWatchRouteStore.setState({ reported: { r1: 1 } });
    await removeRouteFromWatch('r1');
    expect(module.removeRoute).toHaveBeenCalledWith('r1');
    expect(useWatchRouteStore.getState().reported).toEqual({});
  });
});
