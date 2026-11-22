import {
  logDrinkOrQueue,
  removeDrinkOrQueue,
} from '../../src/offline/logDrink';
import { changeWaterIntake } from '../../src/services/api/measurementsApi';
import { ApiError } from '../../src/services/api/errors';
import { TimeoutError } from '../../src/utils/concurrency';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/api/measurementsApi', () => ({
  changeWaterIntake: jest.fn(),
}));
const mockQueue = jest.fn();
const mockRemoveOffline = jest.fn();
jest.mock('../../src/offline/waterHandOver', () => ({
  queueWaterDrink: (...args: unknown[]) => mockQueue(...args),
  removeLatestDrinkOffline: (...args: unknown[]) => mockRemoveOffline(...args),
}));

const mockChange = changeWaterIntake as jest.MockedFunction<
  typeof changeWaterIntake
>;

describe('logDrinkOrQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueue.mockReset();
  });

  it('returns the server answer when the drink is logged', async () => {
    const response = { id: 'x', water_ml: 500, entry_date: '2026-11-21' };
    mockChange.mockResolvedValue(response);

    expect(await logDrinkOrQueue('2026-11-21', 4)).toEqual({
      queued: false,
      response,
    });
    expect(mockChange).toHaveBeenCalledWith({
      entryDate: '2026-11-21',
      changeDrinks: 1,
      containerId: 4,
      clientId: expect.any(String),
    });
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('keeps the drink under the key the failed request carried', async () => {
    mockChange.mockRejectedValue(new TypeError('Network request failed'));
    mockQueue.mockResolvedValue(true);

    expect(await logDrinkOrQueue('2026-11-21', 4)).toEqual({ queued: true });

    const sentKey = mockChange.mock.calls[0][0].clientId;
    expect(mockQueue).toHaveBeenCalledWith(sentKey, {
      entryDate: '2026-11-21',
      containerId: 4,
    });
  });

  it('uses a fresh key for each drink', async () => {
    mockChange.mockRejectedValue(new TypeError('Network request failed'));
    mockQueue.mockResolvedValue(true);

    await logDrinkOrQueue('2026-11-21', 4);
    await logDrinkOrQueue('2026-11-21', 4);

    const [first, second] = mockChange.mock.calls.map(
      ([args]) => args.clientId
    );
    expect(first).not.toBe(second);
  });

  it('does not keep a drink after a timeout, since the server may have it', async () => {
    mockChange.mockRejectedValue(new TimeoutError('Request', 1000));

    await expect(logDrinkOrQueue('2026-11-21', 4)).rejects.toBeInstanceOf(
      TimeoutError
    );
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('passes on a refusal from the server', async () => {
    mockChange.mockRejectedValue(new ApiError('bad', 400));

    await expect(logDrinkOrQueue('2026-11-21', 4)).rejects.toBeInstanceOf(
      ApiError
    );
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('reports the failure when the drink could not be kept either', async () => {
    mockChange.mockRejectedValue(new TypeError('Network request failed'));
    mockQueue.mockResolvedValue(false);

    await expect(logDrinkOrQueue('2026-11-21', 4)).rejects.toBeInstanceOf(
      TypeError
    );
  });
});

describe('removeDrinkOrQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveOffline.mockReset();
  });

  it('returns the server answer when the drink is taken off', async () => {
    const response = { id: 'x', water_ml: 250, entry_date: '2026-11-21' };
    mockChange.mockResolvedValue(response);

    expect(await removeDrinkOrQueue('2026-11-21', 4)).toEqual({
      kept: false,
      response,
    });
    expect(mockChange).toHaveBeenCalledWith({
      entryDate: '2026-11-21',
      changeDrinks: -1,
      containerId: 4,
    });
    expect(mockRemoveOffline).not.toHaveBeenCalled();
  });

  it('takes the latest drink off on the phone when the server was not reached', async () => {
    mockChange.mockRejectedValue(new TypeError('Network request failed'));
    mockRemoveOffline.mockResolvedValue('queued');

    expect(await removeDrinkOrQueue('2026-11-21', 4)).toEqual({
      kept: true,
      result: 'queued',
    });
    expect(mockRemoveOffline).toHaveBeenCalledWith('2026-11-21');
  });

  it('does nothing on the phone after a timeout, since the server may have removed it', async () => {
    mockChange.mockRejectedValue(new TimeoutError('Request', 1000));

    await expect(removeDrinkOrQueue('2026-11-21', 4)).rejects.toThrow();
    expect(mockRemoveOffline).not.toHaveBeenCalled();
  });

  it('passes a refusal on', async () => {
    mockChange.mockRejectedValue(new ApiError('no', 400));

    await expect(removeDrinkOrQueue('2026-11-21', 4)).rejects.toThrow();
    expect(mockRemoveOffline).not.toHaveBeenCalled();
  });
});
