import { act, renderHook } from '@testing-library/react-native';
import { useDateColumnCollapsed } from '../../src/hooks/useDateColumnCollapsed';
import type { OcclusionEvent } from '../../modules/side-bar-metrics';

type Size = { width: number; height: number; scale: number; fontScale: number };

let mockSize: Size;
let mockListener: ((event: OcclusionEvent) => void) | null = null;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockSize,
}));

jest.mock('../../modules/side-bar-metrics', () => ({
  __esModule: true,
  default: {},
  watchOcclusion: (cb: (event: OcclusionEvent) => void) => {
    mockListener = cb;
    return () => {
      mockListener = null;
    };
  },
}));

const WIDE = { width: 951, height: 669, scale: 3, fontScale: 1 };
const TALL = { width: 669, height: 951, scale: 3, fontScale: 1 };

function emit(event: OcclusionEvent) {
  expect(mockListener).not.toBeNull();
  act(() => mockListener!(event));
}

describe('useDateColumnCollapsed across visits to a pose', () => {
  it('does not show a pose its old answer after an activity started elsewhere', () => {
    mockSize = WIDE;
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDateColumnCollapsed(active),
      { initialProps: { active: true } }
    );

    // Wide pose, nothing in the status strip: the full group fits.
    emit({
      regions: [{ x: 867, y: 0, width: 84, height: 124 }],
      metrics: { addTop: 376 },
      windowWidth: WIDE.width,
      windowHeight: WIDE.height,
    });
    expect(result.current).toBe(false);

    // Rotate to the tall pose (horizontal bars). A Live Activity starts there,
    // widening the status cluster.
    mockSize = TALL;
    rerender({ active: false });
    emit({
      regions: [{ x: 467, y: 0, width: 202, height: 82 }],
      metrics: null,
      windowWidth: TALL.width,
      windowHeight: TALL.height,
    });

    // Back to the wide pose before it has been measured again: the activity
    // is known, so the group must already be the collapsed one rather than the
    // answer left over from the earlier visit.
    mockSize = WIDE;
    rerender({ active: true });
    expect(result.current).toBe(true);
  });
});
