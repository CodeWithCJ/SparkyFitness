import { upsertCheckIn, fetchMeasurements } from '../../../src/services/api/measurementsApi';
import { apiFetch } from '../../../src/services/api/apiClient';
import type { CheckInMeasurementRange } from '../../../src/types/measurements';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const lastBody = (): Record<string, unknown> => {
  const call = mockApiFetch.mock.calls.at(-1)?.[0] as { body: Record<string, unknown> };
  return call.body;
};

describe('upsertCheckIn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockResolvedValue({});
  });

  test('posts to the check-in endpoint with snake_case fields', async () => {
    await upsertCheckIn({ entryDate: '2024-06-15', weight: 80.5, bodyFatPercentage: 22.5 });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/measurements/check-in',
        method: 'POST',
      }),
    );
    expect(lastBody()).toMatchObject({
      entry_date: '2024-06-15',
      weight: 80.5,
      body_fat_percentage: 22.5,
    });
  });

  test('omitted fields disappear from the serialized body, so the server leaves them unchanged', async () => {
    await upsertCheckIn({ entryDate: '2024-06-15', weight: 80.5 });

    // JSON.stringify strips undefined-valued keys — this is the wire contract.
    const serialized = JSON.parse(JSON.stringify(lastBody()));
    expect(serialized).toEqual({ entry_date: '2024-06-15', weight: 80.5 });
  });

  test('null fields survive serialization, so the server clears them', async () => {
    await upsertCheckIn({ entryDate: '2024-06-15', weight: null, steps: 9000 });

    const serialized = JSON.parse(JSON.stringify(lastBody()));
    expect(serialized).toEqual({ entry_date: '2024-06-15', weight: null, steps: 9000 });
  });
});

describe('fetchMeasurements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('queries the range endpoint for a single day instead of the carry-forward check-in endpoint', async () => {
    const row = { entry_date: '2024-06-15', weight: 80 } as unknown as CheckInMeasurementRange;
    mockApiFetch.mockResolvedValue([row]);

    const result = await fetchMeasurements('2024-06-15');

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/measurements/check-in-measurements-range/2024-06-15/2024-06-15',
      }),
    );
    expect(result).toBe(row);
  });

  test('returns an empty object when the day has no recorded measurements', async () => {
    mockApiFetch.mockResolvedValue([]);

    await expect(fetchMeasurements('2024-06-15')).resolves.toEqual({});
  });
});
