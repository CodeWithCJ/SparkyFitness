import {
  allowedFormats,
  buildComplicationConfig,
  complicationItemPreviews,
  itemsOf,
  sourceHasProgress,
  COMPLICATION_SOURCE_LABELS,
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

// Fills {{name}} placeholders, as i18next does, so the preview's wording shows.
const t = (
  _key: string,
  options: { defaultValue: string; [option: string]: unknown }
) =>
  options.defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    String(options[name])
  );

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
          extras: [],
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
  it('shows percent with the amount under it, and fills the gauge', () => {
    expect(
      complicationPreview(
        { source: 'calories', format: 'percent', gauge: true },
        t
      )
    ).toEqual({ text: '65%', detail: '1,240 kcal', progress: 0.65 });
  });

  it('shows the value with its goal under it, or what is left', () => {
    expect(
      complicationPreview({ source: 'steps', format: 'value', gauge: false }, t)
    ).toEqual({ text: '6,500', detail: 'of 10,000 steps', progress: null });
    expect(
      complicationPreview(
        { source: 'steps', format: 'remaining', gauge: false },
        t
      )
    ).toEqual({ text: '3,500', detail: 'steps left', progress: null });
  });

  it('says just "left" for a number with no unit', () => {
    expect(
      complicationPreview(
        { source: 'fasting', format: 'remaining', gauge: true },
        t
      )
    ).toEqual({ text: '5:30', detail: 'left', progress: 0.65 });
    expect(
      complicationPreview(
        { source: 'fasting', format: 'value', gauge: false },
        t
      )
    ).toEqual({ text: '10:30', detail: 'of 16:00', progress: null });
  });

  it('falls back to the value, with its unit and no gauge, when there is no goal', () => {
    expect(
      complicationPreview(
        { source: 'weight', format: 'percent', gauge: true },
        t
      )
    ).toEqual({ text: '72.5', detail: 'kg', progress: null });
  });

  it('previews a nutrient too', () => {
    expect(
      complicationPreview(
        { source: 'nutrient:sodium', format: 'value', gauge: true },
        t
      )
    ).toEqual({ text: '12', detail: 'of 18', progress: 0.65 });
  });
});

describe('sources added for sleep, heart and exercise', () => {
  const NEW_SOURCES = [
    'sleepDuration',
    'sleepScore',
    'deepSleep',
    'remSleep',
    'lightSleep',
    'timeInBed',
    'restingHeartRate',
    'hrv',
    'spo2',
    'exerciseMinutes',
    'exerciseCalories',
    'workouts',
  ] as const;

  it('are valid sources with a name and a look', () => {
    for (const source of NEW_SOURCES) {
      expect(isComplicationSource(source)).toBe(true);
      expect(COMPLICATION_SOURCE_LABELS[source](t)).not.toBe('');
      expect(defaultLookFor(source).icon).toBeTruthy();
    }
  });

  it('give every source a name of its own', () => {
    const names = COMPLICATION_SOURCES.map((s) =>
      COMPLICATION_SOURCE_LABELS[s](t)
    );
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('what each source can be written as', () => {
  it('lets a source with a goal use every format', () => {
    for (const source of [
      'calories',
      'water',
      'steps',
      'exerciseMinutes',
      'exerciseCalories',
      'nutrient:sodium',
    ] as const) {
      expect(allowedFormats(source)).toEqual(['value', 'percent', 'remaining']);
    }
  });

  it('gives the sleep score a percent but nothing to count down to', () => {
    expect(sourceHasProgress('sleepScore')).toBe(true);
    expect(sourceHasGoal('sleepScore')).toBe(false);
    expect(allowedFormats('sleepScore')).toEqual(['value', 'percent']);
  });

  it('limits a source with no progress to its value', () => {
    for (const source of [
      'sleepDuration',
      'deepSleep',
      'timeInBed',
      'restingHeartRate',
      'hrv',
      'spo2',
      'workouts',
      'weight',
    ] as const) {
      expect(sourceHasProgress(source)).toBe(false);
      expect(allowedFormats(source)).toEqual(['value']);
    }
  });
});

describe('itemsOf', () => {
  it('is the first value alone when there are no extras', () => {
    expect(itemsOf(sample)).toEqual([
      {
        source: 'protein',
        format: 'percent',
        color: 'protein',
        icon: 'fish.fill',
      },
    ]);
  });

  it('puts the extras after the first value', () => {
    const items = itemsOf({
      ...sample,
      extras: [
        { source: 'carbs', format: 'value', color: 'carbs', icon: 'leaf.fill' },
      ],
    });
    expect(items.map((i) => i.source)).toEqual(['protein', 'carbs']);
  });
});

describe('extra values', () => {
  const base = { name: 'Macros', source: 'protein' };

  it('are kept with their look filled in', () => {
    const result = normalizeComplication(
      {
        ...base,
        extras: [
          { source: 'carbs' },
          { source: 'sleepScore', format: 'bogus' },
        ],
      },
      'x'
    );
    expect(result?.extras).toEqual([
      { source: 'carbs', format: 'percent', color: 'carbs', icon: 'leaf.fill' },
      {
        source: 'sleepScore',
        format: 'percent',
        color: 'sleep',
        icon: 'moon.zzz.fill',
      },
    ]);
  });

  it('stop at two, since the first value is the third', () => {
    const result = normalizeComplication(
      {
        ...base,
        extras: [{ source: 'carbs' }, { source: 'fat' }, { source: 'water' }],
      },
      'x'
    );
    expect(result?.extras?.map((e) => e.source)).toEqual(['carbs', 'fat']);
  });

  it('drop entries with no usable source and repeats of a source already shown', () => {
    const result = normalizeComplication(
      {
        ...base,
        extras: [
          null,
          'text',
          { source: 'nope' },
          { source: 'protein' },
          { source: 'fat' },
          { source: 'fat' },
        ],
      },
      'x'
    );
    expect(result?.extras?.map((e) => e.source)).toEqual(['fat']);
  });

  it('are left off entirely when there are none, so older lists look the same', () => {
    expect(normalizeComplication(base, 'x')).not.toHaveProperty('extras');
    expect(
      normalizeComplication({ ...base, extras: 'carbs' }, 'x')
    ).not.toHaveProperty('extras');
    expect(
      normalizeComplication({ ...base, extras: [] }, 'x')
    ).not.toHaveProperty('extras');
  });

  it('survive an export and an import', () => {
    const withExtras = {
      ...sample,
      extras: [
        { source: 'carbs', format: 'value', color: 'carbs', icon: 'leaf.fill' },
      ],
    } as WatchComplicationDefinition;
    const result = parseComplicationsImport(
      exportComplications([withExtras]),
      makeId
    );
    expect(result?.complications[0].extras).toEqual(withExtras.extras);
  });

  it('are sent to the watch, and an empty list when there are none', () => {
    const withExtras = {
      ...sample,
      extras: [
        { source: 'carbs', format: 'value', color: 'carbs', icon: 'leaf.fill' },
      ],
    } as WatchComplicationDefinition;
    const [first, second] = buildComplicationConfig(
      [withExtras, sample],
      1
    ).definitions;
    expect(first.extras).toEqual([
      { source: 'carbs', format: 'value', color: 'carbs', icon: 'leaf.fill' },
    ]);
    expect(second.extras).toEqual([]);
  });
});

describe('the starter set', () => {
  const starters = starterComplications(t);

  it('has a macros complication of three rings, after Fat', () => {
    const ids = starters.map((d) => d.id);
    expect(ids.indexOf('starter-macros')).toBe(ids.indexOf('starter-fat') + 1);
    const macros = starters.find((d) => d.id === 'starter-macros');
    expect(macros?.name).toBe('Macros');
    expect(itemsOf(macros!).map((i) => i.source)).toEqual([
      'protein',
      'carbs',
      'fat',
    ]);
  });

  it('has the sleep score, which fills a gauge without a goal', () => {
    const sleep = starters.find((d) => d.id === 'starter-sleepScore');
    expect(sleep).toMatchObject({
      source: 'sleepScore',
      format: 'percent',
      gauge: true,
    });
  });

  it('only uses valid sources, at most three values each', () => {
    for (const starter of starters) {
      const items = itemsOf(starter);
      expect(items.length).toBeLessThanOrEqual(3);
      expect(items.every((i) => isComplicationSource(i.source))).toBe(true);
    }
  });
});

describe('complicationItemPreviews', () => {
  it('follows the gauge switch for one value', () => {
    const on = complicationItemPreviews({ ...sample, gauge: true }, t);
    const off = complicationItemPreviews({ ...sample, gauge: false }, t);
    expect(on).toHaveLength(1);
    expect(on[0].progress).toBe(0.65);
    expect(off[0].progress).toBeNull();
  });

  it('draws a ring for each value with progress when there are several', () => {
    const items = complicationItemPreviews(
      {
        ...sample,
        gauge: false,
        extras: [
          {
            source: 'weight',
            format: 'value',
            color: 'weight',
            icon: 'scalemass.fill',
          },
          {
            source: 'carbs',
            format: 'percent',
            color: 'carbs',
            icon: 'leaf.fill',
          },
        ],
      },
      t
    );
    expect(items.map((i) => i.source)).toEqual(['protein', 'weight', 'carbs']);
    expect(items.map((i) => i.progress)).toEqual([0.65, null, 0.65]);
  });

  it('previews the sleep score out of 100 and sleep time as hours and minutes', () => {
    expect(
      complicationPreview(
        { source: 'sleepScore', format: 'percent', gauge: true },
        t
      )
    ).toEqual({ text: '82%', detail: '82', progress: 0.82 });
    expect(
      complicationPreview(
        { source: 'sleepDuration', format: 'value', gauge: false },
        t
      ).text
    ).toBe('7:42');
  });

  it('shows the sleep score as a plain number when it has no goal to count down to', () => {
    expect(
      complicationPreview(
        { source: 'sleepScore', format: 'remaining', gauge: false },
        t
      ).text
    ).toBe('82');
  });
});
