/**
 * Shared types and helpers for the customizable Diary widget grid.
 *
 * Widget keys are stable identifiers used as the react-grid-layout item `i`:
 *   - 'energy' | 'nutrition' | 'water' | 'exercise' (fixed widgets)
 *   - 'meal:<mealTypeId>' (one per visible, user-configurable meal type)
 *
 * The DB stores whatever layout the user arranges. On load we reconcile the
 * saved layout against the user's *current* widget set so meal-type
 * customization (create / hide / delete) never breaks the grid.
 */

export type Breakpoint = 'lg' | 'md' | 'sm' | 'xs';

export interface WidgetLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export type DashboardLayouts = Record<Breakpoint, WidgetLayout[]>;

export const GRID_COLS: Record<Breakpoint, number> = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4,
};

export const GRID_BREAKPOINTS: Record<Breakpoint, number> = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 0,
};

// Grid sizing constants (kept here so px<->row math stays in one place).
export const GRID_ROW_HEIGHT = 28;
export const GRID_MARGIN_Y = 16;

/**
 * Convert a measured content height (px) into the number of grid rows needed to
 * contain it without an inner scrollbar. A tile of `h` rows is
 * `h * rowHeight + (h - 1) * marginY` px tall, so we invert that and round up.
 */
export function pxToRows(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return 1;
  return Math.max(
    1,
    Math.ceil((px + GRID_MARGIN_Y) / (GRID_ROW_HEIGHT + GRID_MARGIN_Y))
  );
}

/**
 * Widths below this are treated as jitter rather than a real resize. Comfortably
 * above any classic scrollbar (~15-17px) so a scrollbar toggle cannot move the
 * grid, but small enough that a real drag-resize of the window still lands.
 */
export const GRID_WIDTH_JITTER_PX = 24;

/**
 * The breakpoint react-grid-layout selects for a container width: the largest
 * breakpoint whose threshold the width reaches.
 */
export function breakpointForWidth(width: number): Breakpoint {
  const ordered = (Object.keys(GRID_BREAKPOINTS) as Breakpoint[]).sort(
    (a, b) => GRID_BREAKPOINTS[b] - GRID_BREAKPOINTS[a]
  );
  for (const bp of ordered) {
    if (width >= GRID_BREAKPOINTS[bp]) return bp;
  }
  return ordered[ordered.length - 1] as Breakpoint;
}

/**
 * Damp the container width fed to the grid.
 *
 * Tile heights are content-measured, so the grid's total height depends on its
 * width -- and the page's width depends on whether that height summons a
 * scrollbar. Near a breakpoint threshold the ~15px scrollbar delta alone can
 * flip lg<->md, swapping in a different saved layout, changing the height, and
 * oscillating forever (#2056). Ignoring sub-jitter changes that would also flip
 * the breakpoint gives the loop the hysteresis it needs to settle.
 *
 * A change large enough to be a real resize, or one that stays inside the
 * current breakpoint, is always accepted so normal resizing still tracks.
 */
export function stabilizeGridWidth(prev: number, next: number): number {
  if (!Number.isFinite(next) || next <= 0) return prev;
  if (!Number.isFinite(prev) || prev <= 0) return next;
  const delta = Math.abs(next - prev);
  if (delta >= GRID_WIDTH_JITTER_PX) return next;
  return breakpointForWidth(next) === breakpointForWidth(prev) ? next : prev;
}

/** Rolling window used to tell a measurement feedback loop from real changes. */
export const MEASURE_WINDOW_MS = 1000;

/**
 * Height changes allowed per widget per window before we treat it as a loop. A
 * settled widget changes height a handful of times (mount, data load, font
 * load) and legitimate later changes are seconds apart, so only a runaway
 * measure -> layout -> measure cycle can reach this in one second.
 */
export const MAX_MEASURE_CHANGES_PER_WINDOW = 12;

export interface MeasureGuard {
  windowStart: number;
  changes: number;
  /** Tallest height seen in this window; what we settle on when thrashing. */
  maxRows: number;
}

/**
 * Decide whether to accept a freshly measured height for one widget.
 *
 * Returns the height to apply (`null` to ignore) plus the guard state to carry
 * forward. Under a loop we settle on the tallest height seen in the window --
 * never clipping content -- and then stop applying anything, which starves the
 * cycle of the re-render that keeps it going. The window expires on its own, so
 * a genuine content change later is picked up normally: this is a rate limit,
 * not a permanent cap.
 */
export function evaluateMeasurement(
  guard: MeasureGuard | undefined,
  rows: number,
  now: number
): { guard: MeasureGuard; apply: number | null } {
  const expired = !guard || now - guard.windowStart > MEASURE_WINDOW_MS;
  const next: MeasureGuard = expired
    ? { windowStart: now, changes: 1, maxRows: rows }
    : {
        windowStart: guard.windowStart,
        changes: guard.changes + 1,
        maxRows: Math.max(guard.maxRows, rows),
      };

  if (next.changes > MAX_MEASURE_CHANGES_PER_WINDOW) {
    return { guard: next, apply: next.maxRows };
  }
  return { guard: next, apply: rows };
}

/**
 * Value-equality for two layout maps (ignores object identity). Used to avoid
 * the controlled react-grid-layout feedback loop: onLayoutChange -> setState ->
 * new prop identity -> onLayoutChange -> ... If the layout did not actually
 * change we keep the previous reference so the grid does not re-fire.
 */
/**
 * Apply content-measured heights over a base layout, then equalize the height
 * of widgets that share a row (same top `y`) to the tallest in that row, so a
 * row of side-by-side widgets has aligned bottoms instead of a ragged edge.
 * Widgets with no measurement yet keep their base height.
 */
export function applyAutoHeights(
  base: DashboardLayouts,
  measuredRows: Record<string, number>
): DashboardLayouts {
  const out = {} as DashboardLayouts;
  const heightOf = (it: WidgetLayout) => {
    const rows = measuredRows[it.i];
    return rows ? Math.max(it.minH ?? 1, rows) : it.h;
  };
  (Object.keys(base) as Breakpoint[]).forEach((bp) => {
    const arr = base[bp];

    // Group widgets that start on the same row (same top `y`).
    const groups = new Map<number, WidgetLayout[]>();
    for (const it of arr) {
      groups.set(it.y, [...(groups.get(it.y) ?? []), it]);
    }

    // A group is only a real "row" to equalize if its items sit side by side
    // (no horizontal overlap). Two full-width widgets transiently sharing a `y`
    // overlap -- equalizing them would amplify a compaction oscillation, so we
    // leave each at its own height in that case.
    const equalizeHeight = new Map<number, number | null>();
    for (const [y, items] of groups) {
      if (items.length < 2) {
        equalizeHeight.set(y, null);
        continue;
      }
      const sorted = [...items].sort((a, b) => a.x - b.x);
      let overlaps = false;
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        if (sorted[i]!.x < prev.x + prev.w) {
          overlaps = true;
          break;
        }
      }
      equalizeHeight.set(y, overlaps ? null : Math.max(...items.map(heightOf)));
    }

    out[bp] = arr.map((it) => {
      const h = equalizeHeight.get(it.y) ?? heightOf(it);
      return h === it.h ? it : { ...it, h };
    });
  });
  return out;
}

/**
 * Merge only the position/width (x, y, w) from an incoming layout onto a base
 * layout, keeping the base's height. Auto-height drives `h` from measured
 * content, so we must NOT let react-grid-layout feed its (content-derived)
 * height back into the persisted base layout -- doing so creates an infinite
 * measure -> layout -> re-measure render loop.
 */
export function mergePositions(
  base: DashboardLayouts,
  incoming: Partial<DashboardLayouts>
): DashboardLayouts {
  const out = {} as DashboardLayouts;
  (Object.keys(base) as Breakpoint[]).forEach((bp) => {
    const inc = incoming[bp];
    if (!Array.isArray(inc)) {
      out[bp] = base[bp];
      return;
    }
    const incByKey = new Map(inc.map((it) => [it.i, it]));
    out[bp] = base[bp].map((it) => {
      const got = incByKey.get(it.i);
      if (!got || (got.x === it.x && got.y === it.y && got.w === it.w)) {
        return it;
      }
      return { ...it, x: got.x, y: got.y, w: got.w };
    });
  });
  return out;
}

export function areLayoutsEqual(
  a: DashboardLayouts | undefined,
  b: DashboardLayouts | undefined
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const bps = Object.keys(GRID_COLS) as Breakpoint[];
  for (const bp of bps) {
    const arrA = a[bp] ?? [];
    const arrB = b[bp] ?? [];
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i++) {
      const x = arrA[i];
      const y = arrB[i];
      if (!x || !y) return false;
      if (
        x.i !== y.i ||
        x.x !== y.x ||
        x.y !== y.y ||
        x.w !== y.w ||
        x.h !== y.h
      ) {
        return false;
      }
    }
  }
  return true;
}

export const MEAL_KEY_PREFIX = 'meal:';

export const mealWidgetKey = (mealTypeId: string) =>
  `${MEAL_KEY_PREFIX}${mealTypeId}`;

export const isMealWidgetKey = (key: string) => key.startsWith(MEAL_KEY_PREFIX);

export const mealTypeIdFromKey = (key: string) =>
  key.slice(MEAL_KEY_PREFIX.length);

/**
 * Build the ordered list of widget keys for the current user state:
 * fixed top widgets, then one per visible meal type, then exercise.
 */
export function buildWidgetKeys(
  visibleMealTypeIds: string[],
  // Diary.tsx only renders the health-metrics widget when there is wearable
  // data to show; reserving its key unconditionally left a hole in the grid
  // for users with none.
  hasDisplayableHealthMetrics = true
): string[] {
  return [
    'energy',
    'nutrition',
    'water',
    ...(hasDisplayableHealthMetrics ? ['healthMetrics'] : []),
    ...visibleMealTypeIds.map(mealWidgetKey),
    'exercise',
  ];
}

/**
 * Generate sensible default layouts for every breakpoint, parameterized by the
 * actual meal widget keys (count varies per user). Used for first-time users
 * and as the source of default tiles when reconciling newly-added widgets.
 */
export function generateDefaultLayouts(mealKeys: string[]): DashboardLayouts {
  // lg (12 cols): energy / nutrition / water across the top, then full-width
  // meal cards and exercise stacked below.
  const lg: WidgetLayout[] = [
    { i: 'energy', x: 0, y: 0, w: 3, h: 10, minW: 2, minH: 6 },
    { i: 'nutrition', x: 3, y: 0, w: 6, h: 10, minW: 3, minH: 6 },
    { i: 'water', x: 9, y: 0, w: 3, h: 10, minW: 2, minH: 6 },
    { i: 'healthMetrics', x: 0, y: 10, w: 12, h: 6, minW: 3, minH: 4 },
  ];
  let lgY = 16;
  for (const key of mealKeys) {
    lg.push({ i: key, x: 0, y: lgY, w: 12, h: 4, minW: 3, minH: 3 });
    lgY += 4;
  }
  lg.push({ i: 'exercise', x: 0, y: lgY, w: 12, h: 4, minW: 3, minH: 3 });

  // md (10 cols): energy + nutrition top row, water below, then meals.
  const md: WidgetLayout[] = [
    { i: 'energy', x: 0, y: 0, w: 4, h: 10, minW: 2, minH: 6 },
    { i: 'nutrition', x: 4, y: 0, w: 6, h: 10, minW: 3, minH: 6 },
    { i: 'water', x: 0, y: 10, w: 10, h: 6, minW: 2, minH: 4 },
    { i: 'healthMetrics', x: 0, y: 16, w: 10, h: 6, minW: 3, minH: 4 },
  ];
  let mdY = 22;
  for (const key of mealKeys) {
    md.push({ i: key, x: 0, y: mdY, w: 10, h: 4, minW: 3, minH: 3 });
    mdY += 4;
  }
  md.push({ i: 'exercise', x: 0, y: mdY, w: 10, h: 4, minW: 3, minH: 3 });

  // sm / xs: single column, everything stacked.
  const stacked = (cols: number): WidgetLayout[] => {
    const out: WidgetLayout[] = [];
    let y = 0;
    const minW = Math.min(2, cols);
    const push = (i: string, h: number, minH: number) => {
      out.push({ i, x: 0, y, w: cols, h, minW, minH });
      y += h;
    };
    push('energy', 10, 6);
    push('nutrition', 10, 6);
    push('water', 8, 5);
    push('healthMetrics', 6, 4);
    for (const key of mealKeys) push(key, 4, 3);
    push('exercise', 4, 3);
    return out;
  };

  return { lg, md, sm: stacked(GRID_COLS.sm), xs: stacked(GRID_COLS.xs) };
}

/**
 * Reconcile a saved layout against the current widget set:
 *   - drop entries for widgets that no longer exist (deleted/hidden meal types)
 *   - append default tiles (at the bottom) for newly-added widgets
 *   - keep the user's existing placement/sizes for everything still present
 *
 * When nothing is saved (blank table), defaults are returned verbatim so the
 * curated first-time arrangement is preserved.
 */
function isValidLayoutItem(it: unknown): it is WidgetLayout {
  if (typeof it !== 'object' || it === null) return false;
  const v = it as Record<string, unknown>;
  return (
    typeof v['i'] === 'string' &&
    Number.isFinite(v['x']) &&
    Number.isFinite(v['y']) &&
    Number.isFinite(v['w']) &&
    Number.isFinite(v['h']) &&
    (v['w'] as number) > 0 &&
    (v['h'] as number) > 0
  );
}

export function reconcileLayouts(
  saved: Partial<DashboardLayouts> | null | undefined,
  currentKeys: string[],
  defaults: DashboardLayouts
): DashboardLayouts {
  if (!saved || typeof saved !== 'object') return defaults;

  const keySet = new Set(currentKeys);
  const result = {} as DashboardLayouts;

  (Object.keys(defaults) as Breakpoint[]).forEach((bp) => {
    const savedArr = saved[bp];
    // Missing or corrupted breakpoint data falls back to the generated default.
    if (!Array.isArray(savedArr) || savedArr.length === 0) {
      result[bp] = defaults[bp];
      return;
    }

    // Keep only well-formed entries for widgets that still exist; anything
    // dropped here (corrupt or stale) is re-added below from defaults.
    const kept = savedArr.filter(
      (it) => isValidLayoutItem(it) && keySet.has(it.i)
    );
    const keptKeys = new Set(kept.map((it) => it.i));
    let maxY = kept.reduce((m, it) => Math.max(m, it.y + it.h), 0);
    const defaultsByKey = new Map(defaults[bp].map((it) => [it.i, it]));

    // Append any current key missing from the saved layout, in canonical order.
    for (const key of currentKeys) {
      if (keptKeys.has(key)) continue;
      const def = defaultsByKey.get(key);
      if (!def) continue;
      kept.push({ ...def, x: 0, y: maxY });
      maxY += def.h;
    }

    result[bp] = kept;
  });

  return result;
}
