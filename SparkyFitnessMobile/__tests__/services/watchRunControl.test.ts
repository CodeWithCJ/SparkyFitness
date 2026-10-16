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
