import { fetchFamilyMealTypes } from '../../src/services/api/mealTypesApi';
import { apiFetch } from '../../src/services/api/apiClient';

jest.mock('../../src/services/api/apiClient', () => ({ apiFetch: jest.fn() }));

test('loads meal definitions from the explicit recipient endpoint', async () => {
  const types = [
    {
      id: 'recipient-custom',
      name: 'After work',
      is_visible: true,
      sort_order: 1,
      user_id: 'recipient',
      created_at: '2026-08-23T00:00:00Z',
      show_in_quick_log: true,
    },
  ];
  (apiFetch as jest.Mock).mockResolvedValue(types);
  await expect(fetchFamilyMealTypes('recipient')).resolves.toEqual(types);
  expect(apiFetch).toHaveBeenCalledWith(
    expect.objectContaining({ endpoint: '/api/meal-types/family/recipient' })
  );
});

test('normalizes nullable recipient meal metadata for the mobile selector', async () => {
  (apiFetch as jest.Mock).mockResolvedValue([
    {
      id: 'custom',
      name: 'After work',
      user_id: 'recipient',
      is_visible: true,
      sort_order: null,
      created_at: null,
      show_in_quick_log: false,
    },
  ]);
  await expect(fetchFamilyMealTypes('recipient')).resolves.toEqual([
    {
      id: 'custom',
      name: 'After work',
      user_id: 'recipient',
      is_visible: true,
      sort_order: 0,
      created_at: '',
      show_in_quick_log: false,
    },
  ]);
});
