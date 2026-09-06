import { HEALTH_TREND_KEYS } from '../../src/constants/healthTrends';
import {
  applyHealthTrendRowMove,
  buildHealthTrendRows,
  HEALTH_TREND_DIVIDER,
  resolveHealthTrendOrder,
  selectVisibleHealthTrends,
} from '../../src/utils/healthTrendPreferences';

describe('resolveHealthTrendOrder', () => {
  test('returns a saved order verbatim when it covers every registered key', () => {
    const savedOrder = ['sleep', 'steps', 'weight'];

    expect(resolveHealthTrendOrder(savedOrder)).toEqual(savedOrder);
  });

  test('appends registry keys the saved order never knew about', () => {
    // An order written before a graph was registered must still reach it, at the end.
    expect(resolveHealthTrendOrder(['steps', 'weight'])).toEqual([
      'steps',
      'weight',
      'sleep',
    ]);
  });

  test('drops keys no longer in the registry and preserves the rest', () => {
    expect(resolveHealthTrendOrder(['steps', 'ghost', 'weight'])).not.toContain(
      'ghost'
    );
    expect(resolveHealthTrendOrder(['steps', 'ghost', 'weight'])).toEqual([
      'steps',
      'weight',
      'sleep',
    ]);
  });

  test('de-duplicates a corrupted saved order', () => {
    const resolvedOrder = resolveHealthTrendOrder(['steps', 'steps', 'weight']);

    expect(resolvedOrder.filter((key) => key === 'steps')).toHaveLength(1);
    expect(resolvedOrder).toEqual(['steps', 'weight', 'sleep']);
  });

  test('returns the full default order for an empty saved order', () => {
    expect(resolveHealthTrendOrder([])).toEqual([...HEALTH_TREND_KEYS]);
  });
});

describe('selectVisibleHealthTrends', () => {
  test('removes hidden keys and keeps the user order', () => {
    expect(
      selectVisibleHealthTrends(['sleep', 'steps', 'weight'], ['steps'])
    ).toEqual(['sleep', 'weight']);
  });

  test('returns nothing when every key is hidden', () => {
    expect(
      selectVisibleHealthTrends([...HEALTH_TREND_KEYS], [...HEALTH_TREND_KEYS])
    ).toEqual([]);
  });
});

describe('buildHealthTrendRows', () => {
  test('puts shown graphs above the divider and hidden ones below', () => {
    expect(
      buildHealthTrendRows(['steps', 'weight', 'sleep'], ['weight'])
    ).toEqual(['steps', 'sleep', HEALTH_TREND_DIVIDER, 'weight']);
  });

  test('keeps the divider first when every graph is hidden', () => {
    expect(
      buildHealthTrendRows(['steps', 'weight'], ['steps', 'weight'])
    ).toEqual([HEALTH_TREND_DIVIDER, 'steps', 'weight']);
  });
});

describe('applyHealthTrendRowMove', () => {
  const rows = ['steps', 'weight', HEALTH_TREND_DIVIDER, 'sleep'] as const;

  test('dragging a graph below the divider hides it', () => {
    expect(applyHealthTrendRowMove(rows, 0, 3)).toEqual({
      order: ['weight', 'sleep', 'steps'],
      hiddenKeys: ['sleep', 'steps'],
    });
  });

  test('dragging a hidden graph above the divider shows it', () => {
    expect(applyHealthTrendRowMove(rows, 3, 0)).toEqual({
      order: ['sleep', 'steps', 'weight'],
      hiddenKeys: [],
    });
  });

  test('reordering above the divider leaves visibility alone', () => {
    expect(applyHealthTrendRowMove(rows, 1, 0)).toEqual({
      order: ['weight', 'steps', 'sleep'],
      hiddenKeys: ['sleep'],
    });
  });

  test('the divider itself cannot be dragged', () => {
    expect(applyHealthTrendRowMove(rows, 2, 0)).toEqual({
      order: ['steps', 'weight', 'sleep'],
      hiddenKeys: ['sleep'],
    });
  });

  test('does not mutate its input', () => {
    const original = [...rows];
    applyHealthTrendRowMove(rows, 0, 3);
    expect(rows).toEqual(original);
  });
});
