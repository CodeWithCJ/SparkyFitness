import React from 'react';
import { render } from '@testing-library/react-native';

import FastingGoalReconciler from '../../src/components/FastingGoalReconciler';
import { useCurrentFast, useFastingGoalReconciler } from '../../src/hooks/useFasting';

jest.mock('../../src/hooks/useFasting', () => ({
  useCurrentFast: jest.fn(),
  useFastingGoalReconciler: jest.fn(),
}));

const mockUseCurrentFast = useCurrentFast as jest.MockedFunction<typeof useCurrentFast>;
const mockReconciler = useFastingGoalReconciler as jest.MockedFunction<
  typeof useFastingGoalReconciler
>;

describe('FastingGoalReconciler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(mockReconciler).toHaveBeenCalledWith(currentFast, false, refetch);
    expect(toJSON()).toBeNull();
  });
});
