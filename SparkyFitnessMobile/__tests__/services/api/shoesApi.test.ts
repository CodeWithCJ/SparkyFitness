import { apiFetch } from '../../../src/services/api/apiClient';
import {
  assignShoeToExerciseEntry,
  createShoe,
  deleteShoe,
  fetchShoes,
  updateShoe,
} from '../../../src/services/api/shoesApi';

jest.mock('../../../src/services/api/apiClient');

const mockedApiFetch = jest.mocked(apiFetch);

beforeEach(() => {
  jest.clearAllMocks();
  mockedApiFetch.mockResolvedValue(undefined as never);
});

describe('shoesApi', () => {
  it('lists every shoe, or only one status', async () => {
    await fetchShoes();
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: '/api/v2/shoes' })
    );
    await fetchShoes('active');
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: '/api/v2/shoes?status=active' })
    );
  });

  it('creates, updates and deletes a shoe', async () => {
    await createShoe({ name: 'Pegasus' });
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/shoes',
        method: 'POST',
        body: { name: 'Pegasus' },
      })
    );
    await updateShoe('s 1', { status: 'retired' });
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/shoes/s%201',
        method: 'PUT',
        body: { status: 'retired' },
      })
    );
    await deleteShoe('s1');
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/shoes/s1',
        method: 'DELETE',
      })
    );
  });

  it('links and unlinks a diary entry', async () => {
    await assignShoeToExerciseEntry('e1', 's1');
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/shoes/assignments/e1',
        method: 'PUT',
        body: { shoe_id: 's1' },
      })
    );
    await assignShoeToExerciseEntry('e1', null);
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: { shoe_id: null } })
    );
  });
});
