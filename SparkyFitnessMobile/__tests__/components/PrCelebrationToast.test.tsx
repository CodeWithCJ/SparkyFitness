import { render, act } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import PrCelebrationToast from '../../src/components/PrCelebrationToast';
import {
  useActiveWorkoutStore,
  __resetActiveWorkoutStoreForTests,
} from '../../src/stores/activeWorkoutStore';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mockPrefs: { default_weight_unit: string } = { default_weight_unit: 'kg' };
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: mockPrefs }),
}));

const mockShow = (Toast as unknown as { show: jest.Mock }).show;

describe('PrCelebrationToast', () => {
  beforeEach(() => {
    __resetActiveWorkoutStoreForTests();
    mockShow.mockClear();
    mockPrefs.default_weight_unit = 'kg';
  });

  it('fires one gold toast per PR event and not again on re-render', () => {
    const { rerender } = render(<PrCelebrationToast />);
    expect(mockShow).not.toHaveBeenCalled();

    act(() => {
      useActiveWorkoutStore.setState({
        lastPrEvent: {
          setId: '102',
          exerciseName: 'Bench Press',
          weightKg: 70,
          reps: 8,
          seq: 1,
        },
      });
    });

    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(mockShow).toHaveBeenCalledWith({
      type: 'pr',
      text1: 'New PR',
      text2: 'Bench Press 70 kg × 8',
    });

    // The same event on re-render must not re-fire (seq dedup).
    rerender(<PrCelebrationToast />);
    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it('fires again for a distinct event (new seq)', () => {
    render(<PrCelebrationToast />);
    act(() => {
      useActiveWorkoutStore.setState({
        lastPrEvent: { setId: '1', exerciseName: 'A', weightKg: 50, reps: 5, seq: 1 },
      });
    });
    act(() => {
      useActiveWorkoutStore.setState({
        lastPrEvent: { setId: '2', exerciseName: 'B', weightKg: 60, reps: 5, seq: 2 },
      });
    });
    expect(mockShow).toHaveBeenCalledTimes(2);
  });

  it('coerces st_lbs to lbs for the weight display', () => {
    mockPrefs.default_weight_unit = 'st_lbs';
    render(<PrCelebrationToast />);

    act(() => {
      useActiveWorkoutStore.setState({
        lastPrEvent: { setId: '1', exerciseName: 'Squat', weightKg: 100, reps: 3, seq: 1 },
      });
    });

    expect(mockShow).toHaveBeenCalledTimes(1);
    const arg = mockShow.mock.calls[0][0];
    expect(arg.text2).toContain('lbs');
    expect(arg.text2).toContain('220.5'); // 100kg → ~220.5 lbs
  });

  it('does not fire when there is no PR event', () => {
    render(<PrCelebrationToast />);
    expect(mockShow).not.toHaveBeenCalled();
  });
});
