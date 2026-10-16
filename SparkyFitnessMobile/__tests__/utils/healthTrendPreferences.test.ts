import { HEALTH_TREND_KEYS } from '../../src/constants/healthTrends';
import {
  resolveHealthTrendOrder,
  selectVisibleHealthTrends,
} from '../../src/utils/healthTrendPreferences';

describe('resolveHealthTrendOrder', () => {
  test('returns a saved order verbatim when it covers every registered key', () => {
    const savedOrder = [
      'sleep',
      'steps',
      'hydration',
      'weight',
      'calories',
      'vo2max',
    ];

    expect(resolveHealthTrendOrder(savedOrder)).toEqual(savedOrder);
  });

  test('appends registry keys the saved order never knew about', () => {
    // An order written before hydration/calories were registered must still reach them,
    // at the end, in registry order.
    expect(resolveHealthTrendOrder(['steps', 'weight', 'sleep'])).toEqual([
      'steps',
      'weight',
      'sleep',
      'hydration',
      'calories',
      'vo2max',
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
      'hydration',
      'calories',
      'vo2max',
    ]);
  });

  test('de-duplicates a corrupted saved order', () => {
    const resolvedOrder = resolveHealthTrendOrder(['steps', 'steps', 'weight']);

    expect(resolvedOrder.filter((key) => key === 'steps')).toHaveLength(1);
    expect(resolvedOrder).toEqual([
      'steps',
      'weight',
      'sleep',
      'hydration',
      'calories',
      'vo2max',
    ]);
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
