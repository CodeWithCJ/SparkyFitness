import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  useWaterIntakeQuery,
  useManualWaterIntakeQuery,
  useFoodWaterIntakeQuery,
} from '@/hooks/Diary/useWaterIntake';
import * as waterIntakeService from '@/api/Diary/waterIntakteService';

jest.mock('@/api/Diary/waterIntakteService');
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const mockedGetWaterIntakeForDate =
  waterIntakeService.getWaterIntakeForDate as jest.MockedFunction<
    typeof waterIntakeService.getWaterIntakeForDate
  >;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper };
};

describe('useWaterIntake day-totals selectors (#1557, #1629)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('splits the combined total into manual and food-derived portions', async () => {
    mockedGetWaterIntakeForDate.mockResolvedValue({
      water_ml: 750,
      manual_ml: 250,
      ledger_ml: 250,
      food_ml: 500,
    });

    const { Wrapper } = createWrapper();
    const totalHook = renderHook(
      () => useWaterIntakeQuery('2026-09-05', 'user-1'),
      { wrapper: Wrapper }
    );
    const manualHook = renderHook(
      () => useManualWaterIntakeQuery('2026-09-05', 'user-1'),
      { wrapper: Wrapper }
    );
    const foodHook = renderHook(
      () => useFoodWaterIntakeQuery('2026-09-05', 'user-1'),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(totalHook.result.current.isSuccess).toBe(true));

    expect(totalHook.result.current.data).toBe(750);
    expect(manualHook.result.current.data).toBe(250);
    expect(foodHook.result.current.data).toBe(500);
  });

  it('defaults food-derived water to 0 on a server that predates the breakdown', async () => {
    mockedGetWaterIntakeForDate.mockResolvedValue({
      water_ml: 500,
      manual_ml: 500,
    });

    const { Wrapper } = createWrapper();
    const foodHook = renderHook(
      () => useFoodWaterIntakeQuery('2026-09-05', 'user-1'),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(foodHook.result.current.isSuccess).toBe(true));
    expect(foodHook.result.current.data).toBe(0);
  });

  it('treats the whole total as manual water on a server predating manual_ml, so "-" stays enabled', async () => {
    mockedGetWaterIntakeForDate.mockResolvedValue({ water_ml: 400 });

    const { Wrapper } = createWrapper();
    const manualHook = renderHook(
      () => useManualWaterIntakeQuery('2026-09-05', 'user-1'),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(manualHook.result.current.isSuccess).toBe(true));
    expect(manualHook.result.current.data).toBe(400);
  });

  it('handles the legacy per-source array shape with all-zero food water', async () => {
    mockedGetWaterIntakeForDate.mockResolvedValue([
      { water_ml: 250, source: 'manual' },
      { water_ml: 250, source: 'health_connect' },
    ]);

    const { Wrapper } = createWrapper();
    const totalHook = renderHook(
      () => useWaterIntakeQuery('2026-09-05', 'user-1'),
      { wrapper: Wrapper }
    );
    const foodHook = renderHook(
      () => useFoodWaterIntakeQuery('2026-09-05', 'user-1'),
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(totalHook.result.current.isSuccess).toBe(true));
    expect(totalHook.result.current.data).toBe(500);
    expect(foodHook.result.current.data).toBe(0);
  });
});
