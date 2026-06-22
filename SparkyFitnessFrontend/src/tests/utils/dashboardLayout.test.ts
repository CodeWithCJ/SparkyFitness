import {
  applyAutoHeights,
  buildWidgetKeys,
  generateDefaultLayouts,
  mealWidgetKey,
  reconcileLayouts,
  type DashboardLayouts,
  type WidgetLayout,
} from '@/utils/dashboardLayout';

describe('buildWidgetKeys', () => {
  it('orders fixed widgets, then meals, then exercise', () => {
    expect(buildWidgetKeys(['a', 'b'])).toEqual([
      'energy',
      'nutrition',
      'water',
      'meal:a',
      'meal:b',
      'exercise',
    ]);
  });
});

describe('generateDefaultLayouts', () => {
  it('includes every widget key on every breakpoint', () => {
    const keys = buildWidgetKeys(['a', 'b']);
    const layouts = generateDefaultLayouts([
      mealWidgetKey('a'),
      mealWidgetKey('b'),
    ]);
    (['lg', 'md', 'sm', 'xs'] as const).forEach((bp) => {
      const present = layouts[bp].map((it) => it.i).sort();
      expect(present).toEqual([...keys].sort());
    });
  });
});

describe('reconcileLayouts', () => {
  const currentKeys = buildWidgetKeys(['a']);
  const defaults = generateDefaultLayouts([mealWidgetKey('a')]);

  it('returns defaults verbatim when nothing is saved', () => {
    expect(reconcileLayouts(null, currentKeys, defaults)).toEqual(defaults);
  });

  it('drops widgets that no longer exist', () => {
    const saved: DashboardLayouts = {
      lg: [
        { i: 'energy', x: 0, y: 0, w: 3, h: 10 },
        { i: 'meal:deleted', x: 0, y: 10, w: 12, h: 4 },
      ],
      md: [],
      sm: [],
      xs: [],
    };
    const result = reconcileLayouts(saved, currentKeys, defaults);
    expect(result.lg.find((it) => it.i === 'meal:deleted')).toBeUndefined();
  });

  it('appends newly-added widgets at the bottom and keeps existing placement', () => {
    const saved: DashboardLayouts = {
      lg: [{ i: 'energy', x: 5, y: 0, w: 4, h: 8 }],
      md: [{ i: 'energy', x: 0, y: 0, w: 4, h: 10 }],
      sm: [{ i: 'energy', x: 0, y: 0, w: 6, h: 10 }],
      xs: [{ i: 'energy', x: 0, y: 0, w: 4, h: 10 }],
    };
    const result = reconcileLayouts(saved, currentKeys, defaults);
    // Existing energy placement is preserved.
    const energy = result.lg.find((it) => it.i === 'energy');
    expect(energy).toMatchObject({ x: 5, y: 0, w: 4, h: 8 });
    // All current keys are present after reconcile.
    expect(result.lg.map((it) => it.i).sort()).toEqual([...currentKeys].sort());
  });

  it('falls back to defaults for a breakpoint with no saved entries', () => {
    const saved: DashboardLayouts = {
      lg: [{ i: 'energy', x: 0, y: 0, w: 3, h: 10 }],
      md: [],
      sm: [],
      xs: [],
    };
    const result = reconcileLayouts(saved, currentKeys, defaults);
    expect(result.md).toEqual(defaults.md);
  });

  it('drops corrupted entries and still yields every current widget', () => {
    const saved = {
      lg: [
        { i: 'energy', x: 0, y: 0, w: 3, h: 10 },
        { i: 'nutrition', x: 3, y: 0, w: 'oops', h: NaN }, // corrupt sizes
        { foo: 'bar' }, // not a layout item at all
      ],
      md: 'totally-not-an-array',
      sm: null,
      xs: undefined,
    } as unknown as DashboardLayouts;

    const result = reconcileLayouts(saved, currentKeys, defaults);

    // Corrupt lg entries dropped, but all current keys re-added from defaults.
    expect(result.lg.map((it) => it.i).sort()).toEqual([...currentKeys].sort());
    expect(
      result.lg.every(
        (it) => Number.isFinite(it.w) && Number.isFinite(it.h) && it.w > 0
      )
    ).toBe(true);
    // Non-array breakpoints fall back to defaults wholesale.
    expect(result.md).toEqual(defaults.md);
    expect(result.sm).toEqual(defaults.sm);
    expect(result.xs).toEqual(defaults.xs);
  });
});

describe('applyAutoHeights', () => {
  const onlyLg = (lg: WidgetLayout[]): DashboardLayouts => ({
    lg,
    md: [],
    sm: [],
    xs: [],
  });

  it('equalizes widgets on the same row to the tallest measured height', () => {
    const base = onlyLg([
      { i: 'energy', x: 0, y: 0, w: 3, h: 4, minH: 2 },
      { i: 'nutrition', x: 3, y: 0, w: 6, h: 4, minH: 2 },
      { i: 'water', x: 9, y: 0, w: 3, h: 4, minH: 2 },
    ]);
    const measured = { energy: 6, nutrition: 16, water: 3 };
    const out = applyAutoHeights(base, measured);
    // All three share y=0 -> all take the tallest (nutrition = 16).
    expect(out.lg.map((it) => it.h)).toEqual([16, 16, 16]);
  });

  it('does not merge across different rows', () => {
    const base = onlyLg([
      { i: 'nutrition', x: 0, y: 0, w: 6, h: 4 },
      { i: 'water', x: 6, y: 0, w: 3, h: 4 },
      { i: 'breakfast', x: 0, y: 4, w: 12, h: 4 },
    ]);
    const measured = { nutrition: 16, water: 3, breakfast: 8 };
    const out = applyAutoHeights(base, measured);
    expect(out.lg.find((it) => it.i === 'nutrition')!.h).toBe(16);
    expect(out.lg.find((it) => it.i === 'water')!.h).toBe(16); // same row as nutrition
    expect(out.lg.find((it) => it.i === 'breakfast')!.h).toBe(8); // own row
  });

  it('respects minH and keeps base height when unmeasured', () => {
    const base = onlyLg([{ i: 'energy', x: 0, y: 0, w: 3, h: 5, minH: 6 }]);
    expect(applyAutoHeights(base, { energy: 2 }).lg[0]!.h).toBe(6); // minH floor
    expect(applyAutoHeights(base, {}).lg[0]!.h).toBe(5); // unmeasured -> base
  });
});
