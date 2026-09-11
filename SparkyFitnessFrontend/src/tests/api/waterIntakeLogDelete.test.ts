import { deleteWaterIntakeLogEntry } from '@/api/Diary/waterIntakteService';
import { apiCall } from '@/api/api';

jest.mock('@/api/api');

const mockedApiCall = apiCall as jest.MockedFunction<typeof apiCall>;

describe('deleteWaterIntakeLogEntry (#2115)', () => {
  beforeEach(() => jest.clearAllMocks());

  // Deleting a linked food entry cascades to its water log row, so a diary
  // page opened before that still offers a drink the server has already
  // dropped. Deleting it again must read as done, not as a failure.
  it('lets an already-deleted row come back as a 404 instead of an error toast', async () => {
    mockedApiCall.mockResolvedValue(null);

    await deleteWaterIntakeLogEntry('log-1');

    expect(mockedApiCall).toHaveBeenCalledWith(
      '/v2/measurements/water-intake/log/log-1',
      expect.objectContaining({ method: 'DELETE', suppress404Toast: true })
    );
  });
});
