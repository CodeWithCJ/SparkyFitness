import { renderHook } from '@testing-library/react-native';
import { useSupersetBorders } from '../../src/components/ActiveWorkoutRail';

describe('useSupersetBorders', () => {
  const exercises = [
    { id: 'a', superset_group: 1 },
    { id: 'b', superset_group: 1 },
    { id: 'c', superset_group: null },
    { id: 'd', superset_group: 2 },
    { id: 'e', superset_group: 2 },
  ];

  it('describes each grouped member, marking the last of its run', () => {
    const { result } = renderHook(() => useSupersetBorders(exercises));
    expect(result.current.runs).toHaveLength(2);
    expect(result.current.borders.get('a')?.isLast).toBe(false);
    expect(result.current.borders.get('b')?.isLast).toBe(true);
    expect(result.current.borders.get('d')?.isLast).toBe(false);
    expect(result.current.borders.get('e')?.isLast).toBe(true);
  });

  it('gives no border to ungrouped exercises', () => {
    const { result } = renderHook(() => useSupersetBorders(exercises));
    expect(result.current.borders.has('c')).toBe(false);
  });

  it('gives no borders when nothing is grouped', () => {
    const { result } = renderHook(() =>
      useSupersetBorders([{ id: 'x' }, { id: 'y', superset_group: null }])
    );
    expect(result.current.runs).toHaveLength(0);
    expect(result.current.borders.size).toBe(0);
  });
});
