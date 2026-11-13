// On macOS Jest resolves the `.ios.ts` variant, which is the module under test.
import {
  endBrushingActivity,
  showBrushingActivity,
} from '../../src/services/brushingLiveActivity';
import BrushingLiveActivityFactory from '../../src/services/BrushingLiveActivityLayout';

const mockUpdate = jest.fn(async () => undefined);
const mockEnd = jest.fn(async () => undefined);
jest.mock('../../src/services/BrushingLiveActivityLayout', () => ({
  __esModule: true,
  default: {
    start: jest.fn(() => ({ update: mockUpdate, end: mockEnd })),
    getInstances: jest.fn(() => []),
  },
}));
jest.mock('../../src/services/liveActivityAppIcon', () => ({
  copyLiveActivityIcon: jest.fn(async () => 'file:///group/icon.png'),
}));
jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(async () => undefined),
}));

const factory = BrushingLiveActivityFactory as unknown as {
  start: jest.Mock;
  getInstances: jest.Mock;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const state = {
  title: 'Brushing timer',
  running: true,
  targetAt: 1_800_000_120_000,
  clockLabel: '2:00',
  statusLabel: 'Upper left',
};

describe('brushingLiveActivity', () => {
  it('starts once with the icon, then updates, then ends every instance', async () => {
    showBrushingActivity(state);
    await flush();
    expect(factory.start).toHaveBeenCalledWith(
      { ...state, appIconUri: 'file:///group/icon.png' },
      'sparkyfitnessmobile://oral-care'
    );

    showBrushingActivity({ ...state, running: false, statusLabel: 'Paused' });
    await flush();
    expect(factory.start).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ running: false, statusLabel: 'Paused' })
    );

    factory.getInstances.mockReturnValue([{ end: mockEnd }]);
    endBrushingActivity();
    await flush();
    expect(mockEnd).toHaveBeenCalledWith('immediate');

    // After an end the next show starts a new activity.
    showBrushingActivity(state);
    await flush();
    expect(factory.start).toHaveBeenCalledTimes(2);
  });
});
