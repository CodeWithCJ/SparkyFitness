import React from 'react';
import { render } from '@testing-library/react-native';

import FastingGoalReconciler from '../../src/components/FastingGoalReconciler';
import {
  useCurrentFast,
  useFastingGoalReconciler,
  useFastingPreferences,
} from '../../src/hooks/useFasting';

jest.mock('../../src/hooks/useFasting', () => ({
  useCurrentFast: jest.fn(),
  useFastingGoalReconciler: jest.fn(),
  useFastingPreferences: jest.fn(),
}));

const mockUseCurrentFast = useCurrentFast as jest.MockedFunction<
  typeof useCurrentFast
>;
const mockReconciler = useFastingGoalReconciler as jest.MockedFunction<
  typeof useFastingGoalReconciler
>;

const mockUseFastingPreferences = useFastingPreferences as jest.MockedFunction<
  typeof useFastingPreferences
>;

describe('FastingGoalReconciler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFastingPreferences.mockReturnValue({
      data: { pre_end_alert_minutes: 45 },
      isLoading: false,
    } as never);
  });

  it('forwards the live current-fast state into the reconciler and renders nothing', () => {
    const currentFast = { id: 'fast-1', status: 'ACTIVE' } as never;
    const refetch = jest.fn();
    mockUseCurrentFast.mockReturnValue({
      data: currentFast,
      isLoading: false,
      refetch,
    } as never);

    const { toJSON } = render(<FastingGoalReconciler />);

    // This headless component is the single owner of reconciliation — it must
    // pass the observed fast straight through so it keeps running even when the
    // visual FastingCard is hidden.
    expect(mockReconciler).toHaveBeenCalledWith(
      currentFast,
      false,
      refetch,
      45
    );
    expect(toJSON()).toBeNull();
  });

  it('waits for fasting preferences before reconciling', () => {
    mockUseCurrentFast.mockReturnValue({
      data: null,
      isLoading: false,
      refetch: jest.fn(),
    } as never);
    mockUseFastingPreferences.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as never);

    render(<FastingGoalReconciler />);

    expect(mockReconciler).toHaveBeenCalledWith(
      null,
      true,
      expect.any(Function),
      undefined
    );
  });

  it('stays blocked when preferences failed and nothing is cached', () => {
    mockUseCurrentFast.mockReturnValue({
      data: { id: 'fast-1' },
      isLoading: false,
      refetch: jest.fn(),
    } as never);
    mockUseFastingPreferences.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as never);

    render(<FastingGoalReconciler />);

    expect(mockReconciler).toHaveBeenCalledWith(
      { id: 'fast-1' },
      true,
      expect.any(Function),
      undefined
    );
  });
});
