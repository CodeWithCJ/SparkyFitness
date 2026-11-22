import { apiFetch } from '../../../src/services/api/apiClient';
import {
  createPregnancy,
  updatePregnancy,
} from '../../../src/services/api/pregnancyApi';
import { testServer } from '../../hooks/queryTestUtils';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const request = jest.mocked(apiFetch);

beforeEach(() => {
  jest.resetAllMocks();
  request.mockResolvedValue({});
});

describe('createPregnancy', () => {
  it('sends to the account it is bound to', async () => {
    await createPregnancy({ fetus_count: 1 }, testServer);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/pregnancy',
        method: 'POST',
        body: { fetus_count: 1 },
        serverConfig: testServer,
      })
    );
  });

  it('uses the active server when not bound', async () => {
    await createPregnancy({ fetus_count: 1 });
    expect(request.mock.calls[0][0].serverConfig).toBeUndefined();
  });
});

describe('updatePregnancy', () => {
  it('sends to the account it is bound to', async () => {
    await updatePregnancy('preg-1', { status: 'active' }, testServer);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/pregnancy/preg-1',
        method: 'PUT',
        body: { status: 'active' },
        serverConfig: testServer,
      })
    );
  });
});
