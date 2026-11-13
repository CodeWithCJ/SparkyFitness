import WatchConnectivity from '../../modules/watch-connectivity';
import {
  sendRunControl,
  startRunOnWatch,
} from '../../src/services/watchRunControl';
import { useWatchRunLiveStore } from '../../src/stores/watchRunLiveStore';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    startRun: jest.fn(() => Promise.resolve()),
    sendRunControl: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const module = WatchConnectivity as unknown as {
  startRun: jest.Mock;
  sendRunControl: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  useWatchRunLiveStore.getState().clear();
  useWatchRunLiveStore.getState().setPending(null);
});

it('sends the Record screen’s switches with the start request', async () => {
  const requestId = await startRunOnWatch({
    kind: 'walk',
    place: 'outdoor',
    autoPause: false,
    voiceCues: true,
  });
  expect(module.startRun).toHaveBeenCalledWith(
    expect.objectContaining({
      requestId,
      kind: 'walk',
      place: 'outdoor',
      autoPause: false,
      voiceCues: true,
    })
  );
  expect(useWatchRunLiveStore.getState().pending?.requestId).toBe(requestId);
});

describe('following a saved route', () => {
  const route = {
    id: 'r1',
    name: 'Loop',
    points: [
      { lat: 51.5, lon: -0.12 },
      { lat: 51.501, lon: -0.12 },
      { lat: 51.501, lon: -0.118 },
    ],
    cues: [],
  };

  it('sends the route with an outdoor start', async () => {
    await startRunOnWatch({
      kind: 'run',
      place: 'outdoor',
      autoPause: true,
      voiceCues: false,
      route,
    });
    const sent = module.startRun.mock.calls[0][0];
    expect(sent.route.id).toBe('r1');
    expect(sent.route.points).toHaveLength(6);
    expect(sent.route.cues.map((c: { kind: string }) => c.kind)).toEqual([
      'depart',
      'right',
      'arrive',
    ]);
  });

  it('refuses an outdoor start whose route has no line to follow', async () => {
    await expect(
      startRunOnWatch({
        kind: 'run',
        place: 'outdoor',
        autoPause: true,
        voiceCues: false,
        route: { ...route, points: [route.points[0]], cues: [] },
      })
    ).rejects.toThrow();
    expect(module.startRun).not.toHaveBeenCalled();
  });

  it('leaves the route out of an indoor start', async () => {
    await startRunOnWatch({
      kind: 'run',
      place: 'indoor',
      autoPause: true,
      voiceCues: false,
      route,
    });
    expect(module.startRun.mock.calls[0][0]).not.toHaveProperty('route');
  });
});

it('sends the pace range with the start request when one is set', async () => {
  await startRunOnWatch({
    kind: 'run',
    place: 'outdoor',
    autoPause: true,
    voiceCues: false,
    paceBand: { minSecondsPerKm: 300, maxSecondsPerKm: 330 },
  });
  expect(module.startRun).toHaveBeenCalledWith(
    expect.objectContaining({ paceMin: 300, paceMax: 330 })
  );
  await startRunOnWatch({
    kind: 'run',
    place: 'outdoor',
    autoPause: true,
    voiceCues: false,
  });
  const [, second] = module.startRun.mock.calls.map(([r]) => r);
  expect(second).not.toHaveProperty('paceMin');
});

it('sends the check-in interval only with voice cues on', async () => {
  await startRunOnWatch({
    kind: 'run',
    place: 'outdoor',
    autoPause: true,
    voiceCues: true,
    checkInMinutes: 10,
  });
  await startRunOnWatch({
    kind: 'run',
    place: 'outdoor',
    autoPause: true,
    voiceCues: false,
    checkInMinutes: 10,
  });
  const [first, second] = module.startRun.mock.calls.map(([r]) => r);
  expect(first).toMatchObject({ checkInMinutes: 10 });
  expect(second).not.toHaveProperty('checkInMinutes');
});

it('sends a switch change for the run with a fresh control id', async () => {
  await sendRunControl('r1', 'autoPauseOff');
  await sendRunControl('r1', 'autoPauseOff');
  const [first, second] = module.sendRunControl.mock.calls.map(
    ([control]) =>
      control as { runId: string; action: string; controlId: string }
  );
  expect(first).toMatchObject({ runId: 'r1', action: 'autoPauseOff' });
  expect(first.controlId).not.toBe(second.controlId);
});
