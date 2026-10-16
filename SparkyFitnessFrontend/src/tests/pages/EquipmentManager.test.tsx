import { fireEvent, screen } from '@testing-library/react';
import type { ShoeResponse } from '@workspace/shared';
import { renderWithClient } from '../test-utils';
import EquipmentManager from '@/pages/Exercises/EquipmentManager';
import { useShoes } from '@/hooks/Shoes/useShoes';

jest.mock('@/hooks/Shoes/useShoes', () => ({
  useShoes: jest.fn(),
  useCreateShoeMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useUpdateShoeMutation: () => ({
    mutate: mockUpdate,
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useDeleteShoeMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    distanceUnit: 'km',
    convertDistance: (value: number) => value,
  }),
}));

const mockUpdate = jest.fn();
let mockCanWrite = true;

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ hasWritePermission: () => mockCanWrite }),
}));

const shoe = (overrides: Partial<ShoeResponse>): ShoeResponse => ({
  id: 'shoe-1',
  user_id: 'user-1',
  name: 'Pegasus 41',
  brand: 'Nike',
  model: null,
  nickname: null,
  purchase_date: null,
  purchase_price: null,
  starting_distance_km: 0,
  retirement_distance_km: 800,
  status: 'active',
  is_default: false,
  retired_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  logged_distance_km: 120,
  total_distance_km: 120,
  run_count: 12,
  last_used_date: '2026-10-10',
  is_worn_out: false,
  ...overrides,
});

describe('Shoes page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanWrite = true;
  });

  it('shows the empty state when there are no shoes', () => {
    (useShoes as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    renderWithClient(<EquipmentManager />);
    expect(screen.getByText(/No shoes yet/i)).toBeTruthy();
  });

  it('shows mileage, a worn-out badge, and retires a pair', () => {
    (useShoes as jest.Mock).mockReturnValue({
      data: [
        shoe({ total_distance_km: 812, is_worn_out: true }),
        shoe({ id: 'shoe-2', name: 'Old pair', status: 'retired' }),
      ],
      isLoading: false,
    });
    renderWithClient(<EquipmentManager />);

    expect(screen.getByText('812.0 km')).toBeTruthy();
    expect(screen.getByText('Worn out')).toBeTruthy();
    expect(screen.getByText('Old pair')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Retire' })[0]!);
    expect(mockUpdate).toHaveBeenCalledWith({
      id: 'shoe-1',
      data: { status: 'retired' },
    });
  });

  it('prompts to retire a worn-out pair, but not one under its limit', () => {
    (useShoes as jest.Mock).mockReturnValue({
      data: [
        shoe({ total_distance_km: 812, is_worn_out: true }),
        shoe({ id: 'shoe-3', name: 'Fresh pair' }),
        shoe({
          id: 'shoe-4',
          name: 'Retired worn',
          status: 'retired',
          is_worn_out: true,
        }),
      ],
      isLoading: false,
    });
    renderWithClient(<EquipmentManager />);

    expect(screen.getAllByText(/has reached its limit/i)).toHaveLength(1);
  });

  it('shows a read-only delegate the mileage but no write controls', () => {
    mockCanWrite = false;
    (useShoes as jest.Mock).mockReturnValue({
      data: [shoe({ total_distance_km: 812, is_worn_out: true })],
      isLoading: false,
    });
    renderWithClient(<EquipmentManager />);

    expect(screen.getByText('812.0 km')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add shoe' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retire' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByText(/has reached its limit/i)).toBeNull();
  });
});
