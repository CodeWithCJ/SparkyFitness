import React from 'react';
import { act, render } from '@testing-library/react-native';
import RestCompleteFlash, {
  restRanOut,
} from '../../src/components/RestCompleteFlash';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

const mockRest = {
  state: 'resting' as 'resting' | 'ready' | 'paused',
  endsAt: null as number | null,
};
jest.mock('../../src/stores/activeWorkoutStore', () => ({
  useActiveWorkoutStore: (
    selector: (s: { rest: typeof mockRest }) => unknown
  ) => selector({ rest: mockRest }),
}));

describe('restRanOut', () => {
  it('counts a rest that reached its deadline, not one skipped early', () => {
    expect(restRanOut(10_000, 10_200)).toBe(true);
    expect(restRanOut(10_000, 9_500)).toBe(true);
    expect(restRanOut(10_000, 5_000)).toBe(false);
    expect(restRanOut(null, 5_000)).toBe(false);
  });
});

describe('RestCompleteFlash', () => {
  afterEach(() => {
    act(() => {
      useAppPreferencesStore.setState({ restFlashEnabled: false });
    });
  });

  it('renders nothing unless chosen in settings', () => {
    const screen = render(<RestCompleteFlash />);
    expect(
      screen.queryByTestId('rest-complete-flash', {
        includeHiddenElements: true,
      })
    ).toBeNull();
  });

  it('draws a non-interactive overlay when on', () => {
    useAppPreferencesStore.setState({ restFlashEnabled: true });
    const screen = render(<RestCompleteFlash />);
    const overlay = screen.getByTestId('rest-complete-flash', {
      includeHiddenElements: true,
    });
    expect(overlay.props.pointerEvents).toBe('none');
  });
});
