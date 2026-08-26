import { fetchFamilyDiaryUsers } from '../../src/services/api/familyApi';
import { fetchDailySummary } from '../../src/services/api/dailySummaryApi';
import {
  getActiveServerConfig,
  type ServerConfig,
} from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage')
    .proxyHeadersToRecord,
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('familyApi', () => {
  const mockFetch = jest.fn();
  const testConfig: ServerConfig = {
    id: 'test-id',
    url: 'https://example.com',
    apiKey: 'test-api-key-12345',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('leaves an unnamed member blank for the presentation layer to localize', async () => {
    mockGetActiveServerConfig.mockResolvedValue(testConfig);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            user_id: 'member-unnamed',
            full_name: null,
            email: null,
            permissions: { diary: true },
            access_end_date: null,
          },
        ]),
    });

    await expect(fetchFamilyDiaryUsers()).resolves.toEqual([
      expect.objectContaining({ displayName: '' }),
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches and normalizes only diary-authorized family users', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            user_id: 'member-b',
            full_name: 'Member B',
            email: 'b@example.test',
            permissions: {
              can_manage_diary: true,
              can_view_food_library: false,
            },
            access_end_date: null,
          },
          {
            user_id: 'member-c',
            full_name: 'Member C',
            email: 'c@example.test',
            permissions: { can_manage_checkin: true },
            access_end_date: null,
          },
        ]),
    });

    await expect(fetchFamilyDiaryUsers()).resolves.toEqual([
      {
        userId: 'member-b',
        displayName: 'Member B',
        email: 'b@example.test',
        canCopy: false,
        accessEndDate: null,
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/identity/users/accessible-users',
      expect.anything(),
    );
  });

  it('supports legacy diary and food-library permission aliases', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            user_id: 'member-b',
            full_name: 'Member B',
            email: null,
            permissions: { diary: true, food_list: true },
            access_end_date: '2026-12-31',
          },
          {
            user_id: 'member-c',
            full_name: 'Member C',
            email: 'c@example.test',
            permissions: { calorie: true },
            access_end_date: null,
          },
        ]),
    });

    await expect(fetchFamilyDiaryUsers()).resolves.toEqual([
      {
        userId: 'member-b',
        displayName: 'Member B',
        email: null,
        canCopy: false,
        accessEndDate: '2026-12-31',
      },
      {
        userId: 'member-c',
        displayName: 'Member C',
        email: 'c@example.test',
        canCopy: false,
        accessEndDate: null,
      },
    ]);
  });

  it('matches diary-read and copy permissions enforced by the server', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            user_id: 'reports-only',
            full_name: 'Reports Only',
            email: null,
            permissions: { can_view_reports: true },
            access_end_date: null,
          },
          {
            user_id: 'food-library-only',
            full_name: 'Food Library Only',
            email: null,
            permissions: { can_view_food_library: true },
            access_end_date: null,
          },
          {
            user_id: 'diary-and-food-library',
            full_name: 'Diary Manager',
            email: null,
            permissions: {
              can_manage_diary: true,
              can_view_food_library: true,
            },
            access_end_date: null,
          },
          {
            user_id: 'legacy-diary-read',
            full_name: 'Legacy Diary Read',
            email: null,
            permissions: {
              can_manage_checkin: true,
              calorie: true,
              food_list: true,
            },
            access_end_date: null,
          },
          {
            user_id: 'legacy-food-library-manager',
            full_name: 'Legacy Food Library Manager',
            email: null,
            permissions: {
              can_manage_diary: true,
              food_list: true,
            },
            access_end_date: null,
          },
          {
            user_id: 'checkin-only',
            full_name: 'Check-in Only',
            email: null,
            permissions: { can_manage_checkin: true },
            access_end_date: null,
          },
        ]),
    });

    await expect(fetchFamilyDiaryUsers()).resolves.toEqual([
      expect.objectContaining({ userId: 'reports-only', canCopy: false }),
      expect.objectContaining({ userId: 'food-library-only', canCopy: false }),
      expect.objectContaining({
        userId: 'diary-and-food-library',
        canCopy: true,
      }),
      expect.objectContaining({ userId: 'legacy-diary-read', canCopy: false }),
      expect.objectContaining({
        userId: 'legacy-food-library-manager',
        canCopy: true,
      }),
    ]);
  });

  it('adds the explicit family user to daily-summary requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await fetchDailySummary('2026-08-23', 'member-b');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/daily-summary?date=2026-08-23&userId=member-b',
      expect.anything(),
    );
  });
});
