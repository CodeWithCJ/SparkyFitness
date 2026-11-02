import { apiFetch } from '../../../src/services/api/apiClient';
import { fetchSymptomEntriesDetailed } from '../../../src/services/api/symptomsApi';
import {
  symptomEntriesDetailedQueryKey,
  symptomEntriesRootQueryKey,
} from '../../../src/hooks/queryKeys';

jest.mock('../../../src/services/api/apiClient');

const mockedApiFetch = jest.mocked(apiFetch);

beforeEach(() => {
  jest.clearAllMocks();
  mockedApiFetch.mockResolvedValue([] as never);
});

describe('fetchSymptomEntriesDetailed', () => {
  it('asks for the entries logged in a range', async () => {
    await fetchSymptomEntriesDetailed('2026-10-01', '2026-10-31');
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint:
          '/api/v2/symptoms/entries?fromDate=2026-10-01&toDate=2026-10-31',
      })
    );
  });

  it('also asks for the episodes that overlap it when told to', async () => {
    await fetchSymptomEntriesDetailed('2026-10-01', '2026-10-31', {
      overlapping: true,
    });
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint:
          '/api/v2/symptoms/entries?fromDate=2026-10-01&toDate=2026-10-31&overlapping=true',
      })
    );
  });
});

describe('symptomEntriesDetailedQueryKey', () => {
  it('keeps overlapping lists apart from plain ones under the same root', () => {
    const plain = symptomEntriesDetailedQueryKey('2026-09-01', '2026-09-30');
    const overlapping = symptomEntriesDetailedQueryKey(
      '2026-09-01',
      '2026-09-30',
      true
    );
    expect(overlapping).not.toEqual(plain);
    // Every symptom mutation invalidates the root, so both are refreshed.
    expect(plain.slice(0, 1)).toEqual([...symptomEntriesRootQueryKey]);
    expect(overlapping.slice(0, 1)).toEqual([...symptomEntriesRootQueryKey]);
  });
});
