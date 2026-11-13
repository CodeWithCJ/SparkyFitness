import { describe, expect, it } from 'vitest';
import {
  calculatePlateLoad,
  convertPlateWeight,
  isValidPlateWeight,
  normalizePlates,
  PLATE_PRESETS,
  plateCalcInputFor,
  presetInventory,
  suggestBar,
  usesBarbell,
  type PlateDenomination,
} from '@workspace/shared';

const kgPlates = PLATE_PRESETS.kg.plates;

const kgInput = (
  targetWeight: number,
  plates: readonly PlateDenomination[] = kgPlates,
  extra: { barWeight?: number; collarWeight?: number } = {}
) => ({
  targetWeight,
  targetUnit: 'kg' as const,
  inventoryUnit: 'kg' as const,
  barWeight: extra.barWeight ?? 20,
  plates,
  collarWeight: extra.collarWeight,
});

describe('calculatePlateLoad', () => {
  it('loads 100 kg on a 20 kg bar as 25 + 15 per side with the fewest plates', () => {
    const result = calculatePlateLoad(kgInput(100));
    expect(result.status).toBe('exact');
    expect(result.load?.perSideWeight).toBe(40);
    expect(result.load?.plates).toEqual([
      { weight: 25, count: 1 },
      { weight: 15, count: 1 },
    ]);
    expect(result.load?.totalWeight).toBe(100);
    expect(result.below).toBeNull();
    expect(result.above).toBeNull();
  });

  it('prefers heavier plates when the plate count ties', () => {
    // 30 per side: 25 + 5, 20 + 10 or 15 + 15
    const result = calculatePlateLoad(kgInput(80));
    expect(result.load?.plates).toEqual([
      { weight: 25, count: 1 },
      { weight: 5, count: 1 },
    ]);
  });

  it('loads the empty bar', () => {
    const result = calculatePlateLoad(kgInput(20));
    expect(result.status).toBe('exact');
    expect(result.load?.plates).toEqual([]);
    expect(result.load?.totalWeight).toBe(20);
  });

  it('does not round a target a hair under the empty bar to exact', () => {
    const result = calculatePlateLoad(kgInput(19.999999999));
    expect(result.status).toBe('inexact');
    expect(result.below).toBeNull();
    expect(result.above?.totalWeight).toBe(20);
  });

  it('keeps the heavier load strictly above a target a hair over the bar', () => {
    const result = calculatePlateLoad(
      kgInput(20.000000001, [{ weight: 1.25, pairs: 4 }])
    );
    expect(result.status).toBe('inexact');
    expect(result.below?.totalWeight).toBe(20);
    expect(result.above?.totalWeight).toBe(22.5);
    expect(result.overBy).toBeGreaterThan(0);
  });

  it('is not fooled where greedy fails: one 20 and two 15s for 30 per side', () => {
    const plates = [
      { weight: 20, pairs: 1 },
      { weight: 15, pairs: 2 },
    ];
    const result = calculatePlateLoad(kgInput(80, plates));
    expect(result.status).toBe('exact');
    expect(result.load?.plates).toEqual([{ weight: 15, count: 2 }]);
  });

  it('respects limited counts and reports the loadable neighbours', () => {
    const plates = [{ weight: 20, pairs: 1 }];
    // 70 kg needs 25 per side; only 0 or 20 is loadable.
    const result = calculatePlateLoad(kgInput(70, plates));
    expect(result.status).toBe('inexact');
    expect(result.load).toBeNull();
    expect(result.below?.totalWeight).toBe(60);
    expect(result.above).toBeNull();
    expect(result.shortBy).toBe(10);
    expect(result.overBy).toBeNull();
  });

  it('gives both neighbours when a target falls between loadable weights', () => {
    // 1.25 kg is the smallest plate: per side steps of 1.25, total steps of 2.5.
    const plates = [{ weight: 1.25, pairs: 4 }];
    const result = calculatePlateLoad(kgInput(21, plates));
    expect(result.status).toBe('inexact');
    expect(result.below?.totalWeight).toBe(20);
    expect(result.above?.totalWeight).toBe(22.5);
    expect(result.shortBy).toBeCloseTo(1, 9);
    expect(result.overBy).toBeCloseTo(1.5, 9);
  });

  it('reports the bar as the lightest load when the target is under the bar', () => {
    const result = calculatePlateLoad(kgInput(15));
    expect(result.status).toBe('inexact');
    expect(result.below).toBeNull();
    expect(result.above?.totalWeight).toBe(20);
    expect(result.overBy).toBe(5);
  });

  it('reports the heaviest load when the target is over what is owned', () => {
    const result = calculatePlateLoad(kgInput(1000));
    expect(result.status).toBe('inexact');
    expect(result.above).toBeNull();
    // Two pairs of every preset plate: (25+20+15+10+5+2.5+1.25+0.5) x 2 per side.
    expect(result.below?.perSideWeight).toBe(158.5);
    expect(result.below?.totalWeight).toBe(20 + 2 * 158.5);
  });

  it('uses odd plates such as 0.25 kg change plates', () => {
    const plates = [...kgPlates, { weight: 0.25, pairs: 1 }];
    const result = calculatePlateLoad(kgInput(100.5, plates));
    expect(result.status).toBe('exact');
    expect(result.load?.plates).toEqual([
      { weight: 25, count: 1 },
      { weight: 15, count: 1 },
      { weight: 0.25, count: 1 },
    ]);
  });

  it('counts collars on both sides of the bar', () => {
    // 20 bar + 2 x 2.5 collars leaves 75 for plates: 37.5 per side.
    const result = calculatePlateLoad(
      kgInput(100, kgPlates, { collarWeight: 2.5 })
    );
    expect(result.status).toBe('exact');
    expect(result.collarsWeight).toBe(5);
    expect(result.load?.perSideWeight).toBe(37.5);
    expect(result.load?.totalWeight).toBe(100);
  });

  it('loads pounds on a 45 lb bar', () => {
    const result = calculatePlateLoad({
      targetWeight: 225,
      targetUnit: 'lbs',
      inventoryUnit: 'lbs',
      barWeight: 45,
      plates: PLATE_PRESETS.lbs.plates,
    });
    expect(result.status).toBe('exact');
    expect(result.load?.plates).toEqual([{ weight: 45, count: 2 }]);
  });

  it('converts exactly between units and never rounds to make a target fit', () => {
    // 100 kg is 220.462... lb, which a pound inventory cannot make exactly.
    const result = calculatePlateLoad({
      targetWeight: 100,
      targetUnit: 'kg',
      inventoryUnit: 'lbs',
      barWeight: 45,
      plates: PLATE_PRESETS.lbs.plates,
    });
    expect(result.unit).toBe('lbs');
    expect(result.target).toBeCloseTo(220.462262, 5);
    expect(result.status).toBe('inexact');
    expect(result.below?.totalWeight).toBe(220);
    expect(result.above?.totalWeight).toBe(222.5);
    expect(result.shortBy).toBeCloseTo(0.462262, 5);
  });

  it('refuses a target that is not a positive number', () => {
    expect(calculatePlateLoad(kgInput(0)).status).toBe('invalid');
    expect(calculatePlateLoad(kgInput(Number.NaN)).status).toBe('invalid');
    expect(calculatePlateLoad(kgInput(-5)).status).toBe('invalid');
  });

  it('refuses a search too large to run rather than cutting it short', () => {
    const plates = Array.from({ length: 20 }, (_, i) => ({
      weight: 100 - i * 0.01,
      pairs: 20,
    }));
    expect(calculatePlateLoad(kgInput(100000, plates)).status).toBe(
      'too_large'
    );
  });

  it('matches a brute-force search over every combination', () => {
    const inventories: PlateDenomination[][] = [
      [
        { weight: 20, pairs: 1 },
        { weight: 15, pairs: 2 },
        { weight: 1, pairs: 1 },
      ],
      [
        { weight: 10, pairs: 2 },
        { weight: 2.5, pairs: 1 },
        { weight: 0.25, pairs: 2 },
      ],
      [
        { weight: 7, pairs: 2 },
        { weight: 3, pairs: 3 },
      ],
    ];
    for (const plates of inventories) {
      const sums = new Set<number>();
      const walk = (i: number, sum: number) => {
        if (i === plates.length) {
          sums.add(Math.round(sum * 1000));
          return;
        }
        for (let k = 0; k <= plates[i]!.pairs; k++) {
          walk(i + 1, sum + k * plates[i]!.weight);
        }
      };
      walk(0, 0);
      const loadable = [...sums].sort((a, b) => a - b);
      for (let total = 20; total <= 120; total += 0.25) {
        const side = Math.round(((total - 20) / 2) * 1000);
        const result = calculatePlateLoad(kgInput(total, plates));
        const exact = loadable.includes(side);
        expect(result.status).toBe(exact ? 'exact' : 'inexact');
        if (exact) {
          expect(Math.round(result.load!.perSideWeight * 1000)).toBe(side);
          continue;
        }
        const lower = [...loadable].reverse().find((s) => s < side);
        const upper = loadable.find((s) => s > side);
        expect(
          result.below ? Math.round(result.below.perSideWeight * 1000) : null
        ).toBe(lower ?? null);
        expect(
          result.above ? Math.round(result.above.perSideWeight * 1000) : null
        ).toBe(upper ?? null);
      }
    }
  });
});

describe('plate helpers', () => {
  it('merges duplicate denominations and drops unusable ones', () => {
    expect(
      normalizePlates([
        { weight: 5, pairs: 1 },
        { weight: 20, pairs: 2 },
        { weight: 5, pairs: 2 },
        { weight: 10, pairs: 0 },
        { weight: -1, pairs: 1 },
        { weight: 1.0001, pairs: 1 },
      ])
    ).toEqual([
      { weight: 20, pairs: 2 },
      { weight: 5, pairs: 3 },
    ]);
  });

  it('accepts up to three decimals', () => {
    expect(isValidPlateWeight(0.125)).toBe(true);
    expect(isValidPlateWeight(1.25)).toBe(true);
    expect(isValidPlateWeight(0.0001)).toBe(false);
    expect(isValidPlateWeight(Number.NaN)).toBe(false);
  });

  it('converts between kilograms and pounds both ways', () => {
    expect(convertPlateWeight(45, 'lbs', 'kg')).toBeCloseTo(20.411657, 5);
    expect(convertPlateWeight(20, 'kg', 'lbs')).toBeCloseTo(44.092452, 5);
    expect(convertPlateWeight(20, 'kg', 'kg')).toBe(20);
  });

  it('knows which equipment is loaded with plates on a bar', () => {
    expect(usesBarbell(['barbell'])).toBe(true);
    expect(usesBarbell('e-z curl bar')).toBe(true);
    expect(usesBarbell(['Trap Bar'])).toBe(true);
    expect(usesBarbell(['dumbbell'])).toBe(false);
    expect(usesBarbell(['machine', 'smith machine'])).toBe(false);
    expect(usesBarbell(null)).toBe(false);
  });

  it('suggests the bar that fits the equipment', () => {
    const bars = PLATE_PRESETS.kg.bars;
    expect(suggestBar(['barbell'], bars)?.kind).toBe('barbell');
    expect(suggestBar(['e-z curl bar'], bars)?.kind).toBe('ez');
    expect(suggestBar(['trap bar'], bars)?.kind).toBe('trap');
    expect(suggestBar(['barbell'], [])).toBeNull();
    expect(suggestBar(['trap bar'], [bars[0]!])?.kind).toBe('barbell');
  });
});

describe('inventory helpers', () => {
  it('builds a kg and a lb preset with ids and no collars counted', () => {
    const kg = presetInventory('kg');
    expect(kg.plates.map((p) => p.weight)).toEqual([
      25, 20, 15, 10, 5, 2.5, 1.25, 0.5,
    ]);
    expect(kg.bars.map((b) => b.weight)).toEqual([20, 15, 7.5, 25]);
    expect(new Set(kg.bars.map((b) => b.id)).size).toBe(kg.bars.length);
    expect(kg.collarsEnabled).toBe(false);
    const lb = presetInventory('lbs');
    expect(lb.plates.map((p) => p.weight)).toEqual([
      45, 35, 25, 10, 5, 2.5, 1.25,
    ]);
    expect(lb.bars[0]!.weight).toBe(45);
  });

  it('only counts collars when the inventory says so', () => {
    const inventory = { ...presetInventory('kg'), collarWeight: 2.5 };
    const bar = inventory.bars[0]!;
    expect(
      calculatePlateLoad(plateCalcInputFor(inventory, bar, 100, 'kg')).load
        ?.totalWeight
    ).toBe(100);
    expect(
      calculatePlateLoad(plateCalcInputFor(inventory, bar, 100, 'kg'))
        .collarsWeight
    ).toBe(0);
    const withCollars = { ...inventory, collarsEnabled: true };
    expect(
      calculatePlateLoad(plateCalcInputFor(withCollars, bar, 100, 'kg'))
        .collarsWeight
    ).toBe(5);
  });
});
