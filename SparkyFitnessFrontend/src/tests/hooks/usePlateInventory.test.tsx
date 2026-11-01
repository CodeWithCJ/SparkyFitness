import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePlateInventory } from '@/hooks/PlateInventory/usePlateInventory';
import { fetchPlateInventory } from '@/api/PlateInventory/plateInventoryService';

jest.mock('@/api/PlateInventory/plateInventoryService', () => ({
  fetchPlateInventory: jest.fn(),
  savePlateInventory: jest.fn(),
  deletePlateInventory: jest.fn(),
}));

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('usePlateInventory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
  });

  it('loads the inventory for the signed-in person', async () => {
    (fetchPlateInventory as jest.Mock).mockResolvedValue({ inventory: null });
    const { result } = renderHook(() => usePlateInventory(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchPlateInventory).toHaveBeenCalledTimes(1);
  });

  it('does not request it while acting on behalf of someone', () => {
    mockActingOnBehalf = true;
    const { result } = renderHook(() => usePlateInventory(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchPlateInventory).not.toHaveBeenCalled();
  });
});
