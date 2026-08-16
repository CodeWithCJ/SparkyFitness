import {
  applyAutoHeights,
  breakpointForWidth,
  buildWidgetKeys,
  evaluateMeasurement,
  generateDefaultLayouts,
  MAX_MEASURE_CHANGES_PER_WINDOW,
  mealWidgetKey,
  MEASURE_WINDOW_MS,
  reconcileLayouts,
  stabilizeGridWidth,
  type DashboardLayouts,
  type MeasureGuard,
  type WidgetLayout,
} from '@/utils/dashboardLayout';

describe('buildWidgetKeys', () => {
  it('orders fixed widgets, then meals, then exercise', () => {
    expect(buildWidgetKeys(['a', 'b'])).toEqual([
      'energy',
      'nutrition',
      'water',
      'healthMetrics',
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

describe('breakpointForWidth', () => {
  it('selects the largest breakpoint the width reaches', () => {
    expect(breakpointForWidth(1400)).toBe('lg');
    expect(breakpointForWidth(1200)).toBe('lg');
    expect(breakpointForWidth(1199)).toBe('md');
    expect(breakpointForWidth(996)).toBe('md');
    expect(breakpointForWidth(995)).toBe('sm');
    expect(breakpointForWidth(768)).toBe('sm');
    expect(breakpointForWidth(767)).toBe('xs');
    expect(breakpointForWidth(0)).toBe('xs');
  });
});

describe('stabilizeGridWidth', () => {
  it('ignores a scrollbar-sized change that would flip the breakpoint', () => {
    // The #2056 loop: a ~15px scrollbar toggle straddling the lg threshold.
    expect(stabilizeGridWidth(1205, 1190)).toBe(1205);
    expect(stabilizeGridWidth(1190, 1205)).toBe(1190);
  });

  it('accepts small changes that stay inside one breakpoint', () => {
    expect(stabilizeGridWidth(1300, 1285)).toBe(1285);
    expect(stabilizeGridWidth(900, 890)).toBe(890);
  });

  it('accepts a real resize even when it crosses a breakpoint', () => {
    expect(stabilizeGridWidth(1205, 1100)).toBe(1100);
    expect(stabilizeGridWidth(1100, 1205)).toBe(1205);
  });

  it('always takes the first real measurement and ignores bogus widths', () => {
    expect(stabilizeGridWidth(0, 1190)).toBe(1190);
    expect(stabilizeGridWidth(1205, 0)).toBe(1205);
    expect(stabilizeGridWidth(1205, Number.NaN)).toBe(1205);
  });

  it('settles: alternating jitter never oscillates the fed width', () => {
    let width = 1205;
    for (const next of [1190, 1205, 1190, 1205, 1190]) {
      width = stabilizeGridWidth(width, next);
    }
    expect(width).toBe(1205);
  });
});

describe('evaluateMeasurement', () => {
  const run = (
    values: number[],
    stepMs = 0,
    start = 1000
  ): (number | null)[] => {
    let guard: MeasureGuard | undefined;
    return values.map((rows, i) => {
      const out = evaluateMeasurement(guard, rows, start + i * stepMs);
      guard = out.guard;
      return out.apply;
    });
  };

  it('applies normal measurements', () => {
    expect(run([8, 9, 10], 200)).toEqual([8, 9, 10]);
  });

  // One change past the limit, so the burst keeps exercising the capped path
  // whatever MAX_MEASURE_CHANGES_PER_WINDOW is tuned to.
  const burstOverLimit = () =>
    Array.from({ length: MAX_MEASURE_CHANGES_PER_WINDOW + 1 }, (_, i) =>
      i % 2 ? 12 : 9
    );

  it('settles on the tallest height once a burst looks like a loop', () => {
    // Alternating changes inside one window: a measure -> layout -> measure cycle.
    const alternating = burstOverLimit();
    const applied = run(alternating);
    expect(applied.slice(0, MAX_MEASURE_CHANGES_PER_WINDOW)).toEqual(
      alternating.slice(0, MAX_MEASURE_CHANGES_PER_WINDOW)
    );
    // Everything past the cap settles on the tallest seen, so content is never clipped.
    for (const value of applied.slice(MAX_MEASURE_CHANGES_PER_WINDOW)) {
      expect(value).toBe(12);
    }
  });

  it('is a rate limit, not a permanent cap: later real changes still apply', () => {
    // Exhaust the window...
    let guard: MeasureGuard | undefined;
    for (const rows of burstOverLimit()) {
      guard = evaluateMeasurement(guard, rows, 1000).guard;
    }
    expect(guard?.changes).toBeGreaterThan(MAX_MEASURE_CHANGES_PER_WINDOW);
    // ...then a genuine change well after the window expires.
    const later = evaluateMeasurement(guard, 7, 1000 + MEASURE_WINDOW_MS + 1);
    expect(later.apply).toBe(7);
    expect(later.guard.changes).toBe(1);
  });

  it('does not trip when changes are spread across windows', () => {
    const spread = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(run(spread, MEASURE_WINDOW_MS + 1)).toEqual(spread);
  });
});
