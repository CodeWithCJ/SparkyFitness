import { act, renderHook } from '@testing-library/react-native';
import { usePregnancyMutations } from '../../src/hooks/usePregnancy';
import {
  createPregnancy,
  updatePregnancy,
} from '../../src/services/api/pregnancyApi';
import type { SharedPregnancy } from '@workspace/shared';
import {
  createQueryWrapper,
  createTestQueryClient,
  testServer,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/pregnancyApi', () => ({
  getCurrent: jest.fn(),
  getOverview: jest.fn(),
  createPregnancy: jest.fn(),
  updatePregnancy: jest.fn(),
  deletePregnancy: jest.fn(),
}));

let queryClient: QueryClient;

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(createPregnancy).mockResolvedValue({} as SharedPregnancy);
  jest.mocked(updatePregnancy).mockResolvedValue({} as SharedPregnancy);
  queryClient = createTestQueryClient();
});

afterEach(() => queryClient.clear());

const body = {
  due_date: '2027-05-01',
  due_date_basis: 'manual',
  lmp_date: null,
  conception_date: null,
  fetus_count: 1,
  status: 'active',
  notes: null,
} as Omit<SharedPregnancy, 'id' | 'user_id'>;

function setup() {
  return renderHook(() => usePregnancyMutations(), {
    wrapper: createQueryWrapper(queryClient),
  });
}

it('passes the bound account on to the create request', async () => {
  const { result } = setup();
  await act(() =>
    result.current.createPregnancyAsync({ body, serverConfig: testServer })
  );
  expect(createPregnancy).toHaveBeenCalledWith(body, testServer);
});

it('passes the bound account on to the update request', async () => {
  const { result } = setup();
  await act(() =>
    result.current.updatePregnancyAsync({
      id: 'preg-1',
      body: { status: 'active' },
      serverConfig: testServer,
    })
  );
  expect(updatePregnancy).toHaveBeenCalledWith(
    'preg-1',
    { status: 'active' },
    testServer
  );
});
