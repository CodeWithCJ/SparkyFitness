import {
  buildComplicationConfig,
  COMPLICATION_COLORS,
  COMPLICATION_COLOR_HEX,
  COMPLICATION_COLOR_LABELS,
  COMPLICATION_FORMAT_LABELS,
  COMPLICATION_FORMATS,
  COMPLICATION_ICON_LABELS,
  COMPLICATION_ICONS,
  COMPLICATION_SOURCES,
  complicationPreview,
  complicationSourceLabel,
  moveComplication,
  nutrientKeyOf,
  removeComplication,
  sourceHasGoal,
  upsertComplication,
  defaultLookFor,
  exportComplications,
  isComplicationSource,
  MAX_COMPLICATION_NAME_LENGTH,
  normalizeComplication,
  parseComplicationsImport,
  resolveComplications,
  starterComplications,
  type WatchComplicationDefinition,
} from '../../src/utils/watchComplications';

const t = (_key: string, options: { defaultValue: string }) =>
  options.defaultValue;

const sample: WatchComplicationDefinition = {
  id: 'c1',
  name: 'Protein',
  source: 'protein',
  format: 'percent',
  gauge: true,
  color: 'protein',
  icon: 'fish.fill',
};

let counter = 0;
const makeId = () => `new-${++counter}`;

describe('isComplicationSource', () => {
  it('accepts every fixed source and nutrient sources', () => {
    for (const source of COMPLICATION_SOURCES) {
      expect(isComplicationSource(source)).toBe(true);
    }
    expect(isComplicationSource('nutrient:dietary_fiber')).toBe(true);
  });

  it('rejects unknown sources, an empty nutrient and non-strings', () => {
    expect(isComplicationSource('sleep')).toBe(false);
    expect(isComplicationSource('nutrient:')).toBe(false);
    expect(isComplicationSource(7)).toBe(false);
    expect(isComplicationSource(undefined)).toBe(false);
  });
});

describe('defaultLookFor', () => {
  it('gives goal-based sources a gauge and plain values none', () => {
    expect(defaultLookFor('calories')).toMatchObject({
      format: 'percent',
      gauge: true,
    });
    expect(defaultLookFor('weight')).toMatchObject({
      format: 'value',
      gauge: false,
    });
  });

  it('gives a nutrient a percent gauge', () => {
    expect(defaultLookFor('nutrient:sodium')).toMatchObject({
      format: 'percent',
      gauge: true,
      color: 'neutral',
    });
  });
});

describe('starterComplications', () => {
  it('names each from the translator and keeps ids stable', () => {
    const first = starterComplications(t);
    const second = starterComplications(t);
    expect(first.map((d) => d.id)).toEqual(second.map((d) => d.id));
    expect(first[0]).toMatchObject({
      id: 'starter-calories',
      name: 'Calories',
      source: 'calories',
    });
    expect(first.find((d) => d.source === 'caloriesRemaining')?.name).toBe(
      'Calories left'
    );
  });

  it('only uses valid sources and unique ids', () => {
    const list = starterComplications(t);
    expect(list.every((d) => isComplicationSource(d.source))).toBe(true);
    expect(new Set(list.map((d) => d.id)).size).toBe(list.length);
  });
});

describe('resolveComplications', () => {
  it('sends the starter set until the wearer has a list', () => {
    expect(resolveComplications(null, t)).toEqual(starterComplications(t));
  });

  it("keeps the wearer's own list, even when empty", () => {
    expect(resolveComplications([], t)).toEqual([]);
    expect(resolveComplications([sample], t)).toEqual([sample]);
  });
});

describe('normalizeComplication', () => {
  it('fills what is missing from the source look', () => {
    expect(
      normalizeComplication({ name: 'Water', source: 'water' }, 'x')
    ).toEqual({
      id: 'x',
      name: 'Water',
      source: 'water',
      format: 'percent',
      gauge: true,
      color: 'water',
      icon: 'drop.fill',
    });
  });

  it('replaces unknown formats, colours and icons with the default', () => {
    const result = normalizeComplication(
      {
        name: 'Steps',
        source: 'steps',
        format: 'bogus',
        color: 'pink',
        icon: 'not.a.symbol',
        gauge: 'yes',
      },
      'x'
    );
    expect(result).toMatchObject({
      format: 'value',
      color: 'steps',
      icon: 'figure.walk',
      gauge: true,
    });
  });

  it('trims and shortens the name', () => {
    const result = normalizeComplication(
      { name: `  ${'a'.repeat(40)}  `, source: 'fat' },
      'x'
    );
    expect(result?.name).toHaveLength(MAX_COMPLICATION_NAME_LENGTH);
  });

  it('refuses entries with no usable source or name', () => {
    expect(normalizeComplication(null, 'x')).toBeNull();
    expect(normalizeComplication('text', 'x')).toBeNull();
    expect(
      normalizeComplication({ name: 'A', source: 'sleep' }, 'x')
    ).toBeNull();
    expect(
      normalizeComplication({ name: '   ', source: 'fat' }, 'x')
    ).toBeNull();
    expect(normalizeComplication({ source: 'fat' }, 'x')).toBeNull();
  });
});

describe('export and import', () => {
  it('round-trips a list, with new ids and no ids in the file', () => {
    const text = exportComplications([sample]);
    expect(text).not.toContain('"id"');
    const result = parseComplicationsImport(text, makeId);
    expect(result?.skipped).toBe(0);
    expect(result?.complications).toHaveLength(1);
    expect(result?.complications[0]).toEqual({
      ...sample,
      id: expect.stringMatching(/^new-/),
    });
  });

  it('gives each imported entry its own id', () => {
    const text = exportComplications([sample, { ...sample, name: 'Other' }]);
    const result = parseComplicationsImport(text, makeId);
    const ids = result?.complications.map((d) => d.id) ?? [];
    expect(new Set(ids).size).toBe(2);
  });

  it('counts entries it cannot use instead of failing the file', () => {
    const text = JSON.stringify({
      type: 'sparkyfitness.watch-complications',
      version: 1,
      complications: [{ name: 'Good', source: 'water' }, { name: 'Bad' }, 5],
    });
    const result = parseComplicationsImport(text, makeId);
    expect(result?.complications.map((d) => d.name)).toEqual(['Good']);
    expect(result?.skipped).toBe(2);
  });

  it('returns null for text that is not one of our files', () => {
    expect(parseComplicationsImport('not json', makeId)).toBeNull();
    expect(parseComplicationsImport('[]', makeId)).toBeNull();
    expect(parseComplicationsImport('{"type":"other"}', makeId)).toBeNull();
    expect(
      parseComplicationsImport(
        '{"type":"sparkyfitness.watch-complications","complications":"x"}',
        makeId
      )
    ).toBeNull();
  });
});

describe('buildComplicationConfig', () => {
  it('carries every field the watch reads, and the revision', () => {
    expect(buildComplicationConfig([sample], 1234)).toEqual({
      revision: 1234,
      definitions: [
        {
          id: 'c1',
          name: 'Protein',
          source: 'protein',
          format: 'percent',
          gauge: true,
          color: 'protein',
          icon: 'fish.fill',
        },
      ],
    });
  });

  it('sends an empty list as an empty list', () => {
    expect(buildComplicationConfig([], 1).definitions).toEqual([]);
  });
});

describe('nutrientKeyOf and sourceHasGoal', () => {
  it('reads the nutrient behind a nutrient source only', () => {
    expect(nutrientKeyOf('nutrient:dietary_fiber')).toBe('dietary_fiber');
    expect(nutrientKeyOf('protein')).toBeNull();
  });

  it('knows which sources have no goal', () => {
    for (const source of [
      'caloriesRemaining',
      'caloriesBurned',
      'weight',
      'bodyFat',
    ] as const) {
      expect(sourceHasGoal(source)).toBe(false);
    }
    for (const source of [
      'calories',
      'protein',
      'water',
      'steps',
      'fasting',
      'nutrient:sodium',
    ] as const) {
      expect(sourceHasGoal(source)).toBe(true);
    }
  });
});

describe('labels and colours', () => {
  it('has a label for every format, colour and icon, and a hex for every colour', () => {
    for (const format of COMPLICATION_FORMATS) {
      expect(COMPLICATION_FORMAT_LABELS[format](t)).not.toBe('');
    }
    for (const color of COMPLICATION_COLORS) {
      expect(COMPLICATION_COLOR_LABELS[color](t)).not.toBe('');
      expect(COMPLICATION_COLOR_HEX[color]).toMatch(/^#[0-9A-F]{6}$/);
    }
    for (const icon of COMPLICATION_ICONS) {
      expect(COMPLICATION_ICON_LABELS[icon](t)).not.toBe('');
    }
  });

  it('gives each colour and icon its own label', () => {
    const colours = COMPLICATION_COLORS.map((c) =>
      COMPLICATION_COLOR_LABELS[c](t)
    );
    const icons = COMPLICATION_ICONS.map((i) => COMPLICATION_ICON_LABELS[i](t));
    expect(new Set(colours).size).toBe(colours.length);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe('complicationSourceLabel', () => {
  it('names a fixed source from its own label', () => {
    expect(complicationSourceLabel('caloriesBurned', t)).toBe(
      'Calories burned'
    );
  });

  it('names a nutrient source from the nutrient', () => {
    expect(complicationSourceLabel('nutrient:protein', t)).toBe('Protein');
  });
});

describe('list operations', () => {
  const a = { ...sample, id: 'a', name: 'A' };
  const b = { ...sample, id: 'b', name: 'B' };
  const c = { ...sample, id: 'c', name: 'C' };

  it('upsert adds at the end and replaces in place', () => {
    expect(upsertComplication([a, b], c).map((d) => d.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    const renamed = { ...a, name: 'Renamed' };
    const result = upsertComplication([a, b], renamed);
    expect(result.map((d) => d.name)).toEqual(['Renamed', 'B']);
  });

  it('remove drops one entry and leaves the rest in order', () => {
    expect(removeComplication([a, b, c], 'b').map((d) => d.id)).toEqual([
      'a',
      'c',
    ]);
    expect(removeComplication([a], 'missing')).toEqual([a]);
  });

  it('move swaps with the neighbour, and does nothing at the ends', () => {
    expect(moveComplication([a, b, c], 'b', -1).map((d) => d.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(moveComplication([a, b, c], 'b', 1).map((d) => d.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(moveComplication([a, b, c], 'a', -1).map((d) => d.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(moveComplication([a, b, c], 'c', 1).map((d) => d.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(moveComplication([a, b, c], 'missing', 1).map((d) => d.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('never changes the list it was given', () => {
    const list = [a, b, c];
    moveComplication(list, 'a', 1);
    removeComplication(list, 'a');
    upsertComplication(list, { ...a, name: 'X' });
    expect(list.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('complicationPreview', () => {
  it('shows percent and fills the gauge for a source with a goal', () => {
    expect(
      complicationPreview({
        source: 'calories',
        format: 'percent',
        gauge: true,
      })
    ).toEqual({ text: '65%', progress: 0.65 });
  });

  it('shows the value, or what is left, in the sample day', () => {
    expect(
      complicationPreview({ source: 'steps', format: 'value', gauge: false })
    ).toEqual({ text: '6,500', progress: null });
    expect(
      complicationPreview({
        source: 'steps',
        format: 'remaining',
        gauge: false,
      })
    ).toEqual({ text: '3,500', progress: null });
  });

  it('falls back to the value, with no gauge, when there is no goal', () => {
    expect(
      complicationPreview({ source: 'weight', format: 'percent', gauge: true })
    ).toEqual({ text: '72.5', progress: null });
  });

  it('previews a nutrient too', () => {
    expect(
      complicationPreview({
        source: 'nutrient:sodium',
        format: 'value',
        gauge: true,
      })
    ).toEqual({ text: '12', progress: 0.65 });
  });
});
