import {
  isMultiEntryFrequency,
  rowValue,
  syncCustomForm,
  buildCustomOps,
  emptyFormFor,
  entryTimestampFor,
  findHourlyHourConflict,
  type CustomCategoryMeta,
  type CustomFormState,
  type CustomRow,
} from '../../src/utils/customMeasurementsForm';
import type { CustomMeasurementEntry } from '../../src/types/customMeasurements';

const numericCat = (frequency: string, id?: string): CustomCategoryMeta => ({
  id: id ?? `cat-${frequency.toLowerCase()}`,
  name: id ?? `cat-${frequency.toLowerCase()}`,
  display_name: id ?? `cat-${frequency.toLowerCase()}`,
  measurement_type: '',
  frequency,
  data_type: 'numeric',
});

const boolCat: CustomCategoryMeta = {
  id: 'cat-bool',
  name: 'Bool',
  display_name: 'Bool',
  measurement_type: '',
  frequency: 'Daily',
  data_type: 'boolean',
};

const entry = (
  id: string,
  categoryId: string,
  value: string,
  extra: Partial<CustomMeasurementEntry> = {},
): CustomMeasurementEntry => ({
  id,
  category_id: categoryId,
  value,
  entry_date: '2026-07-30',
  ...extra,
});

const row = (overrides: Partial<CustomRow> & { key: string }): CustomRow => ({
  entryId: null,
  hour: null,
  timestamp: null,
  source: null,
  value: '',
  ...overrides,
});

describe('isMultiEntryFrequency', () => {
  it('treats Hourly, All, and Unlimited as multi-entry frequencies', () => {
    expect(isMultiEntryFrequency('Hourly')).toBe(true);
    expect(isMultiEntryFrequency('All')).toBe(true);
    expect(isMultiEntryFrequency('Unlimited')).toBe(true);
  });

  it('treats Daily and missing frequencies as single-entry', () => {
    expect(isMultiEntryFrequency('Daily')).toBe(false);
    expect(isMultiEntryFrequency(null)).toBe(false);
    expect(isMultiEntryFrequency(undefined)).toBe(false);
  });
});

describe('rowValue', () => {
  it('parses numeric values', () => {
    expect(rowValue('  125  ', 'numeric')).toBe(125);
    expect(rowValue('12.5', 'numeric')).toBe(12.5);
    expect(rowValue('125', null)).toBe(125);
  });

  it('returns null for empty or non-numeric numeric values', () => {
    expect(rowValue('', 'numeric')).toBe(null);
    expect(rowValue('abc', 'numeric')).toBe(null);
  });

  it('maps boolean data types to the server boolean strings', () => {
    expect(rowValue('true', 'boolean')).toBe('true');
    expect(rowValue('false', 'boolean')).toBe('false');
    expect(rowValue('', 'boolean')).toBe(null);
    expect(rowValue('yes', 'boolean')).toBe(null);
  });

  it('passes text values through trimmed', () => {
    expect(rowValue('  hello ', 'text')).toBe('hello');
  });
});

describe('syncCustomForm', () => {
  it('keeps dirty values across a refetch while untouched rows mirror the server', () => {
    const current: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'entry-e1', entryId: 'e1', value: '125' })], deleted: [] },
    };

    const { form } = syncCustomForm({
      categories: [numericCat('Daily')],
      serverEntries: [entry('e1', 'cat-daily', '120')],
      current,
      dirtyKeys: new Set(['entry-e1']),
    });

    expect(form['cat-daily'].rows[0]).toMatchObject({ key: 'entry-e1', entryId: 'e1', value: '125' });
  });

  it('mirrors server values for untouched rows', () => {
    const current: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'entry-e1', entryId: 'e1', value: '125' })], deleted: [] },
    };

    const { form } = syncCustomForm({
      categories: [numericCat('Daily')],
      serverEntries: [entry('e1', 'cat-daily', '120')],
      current,
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows[0]).toMatchObject({ key: 'entry-e1', entryId: 'e1', value: '120' });
  });

  it('drops non-dirty rows whose server entry disappeared', () => {
    const current: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'entry-e1', entryId: 'e1', value: '125' })], deleted: [] },
    };

    const { form } = syncCustomForm({
      categories: [numericCat('Daily')],
      serverEntries: [],
      current,
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows).toEqual([]);
  });

  it('keeps dirty rows whose server entry disappeared as new rows', () => {
    const current: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'entry-e1', entryId: 'e1', value: '125', hour: 2 })], deleted: [] },
    };

    const { form } = syncCustomForm({
      categories: [numericCat('Daily')],
      serverEntries: [],
      current,
      dirtyKeys: new Set(['entry-e1']),
    });

    expect(form['cat-daily'].rows[0]).toMatchObject({ key: 'entry-e1', entryId: null, value: '125' });
  });

  it('keeps one row per Hourly entry, ordered by hour, and never flattens', () => {
    const { form, prefilledKeys } = syncCustomForm({
      categories: [numericCat('Hourly')],
      serverEntries: [
        entry('h2', 'cat-hourly', '20', { entry_hour: 2 }),
        entry('h1', 'cat-hourly', '10', { entry_hour: 1 }),
        entry('h0', 'cat-hourly', '05', { entry_hour: 0 }),
      ],
      current: {},
      dirtyKeys: new Set(),
    });

    const rows = form['cat-hourly'].rows;
    expect(rows.map((r) => r.hour)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.entryId)).toEqual(['h0', 'h1', 'h2']);
    expect(rows.map((r) => r.value)).toEqual(['05', '10', '20']);
    expect(prefilledKeys.has('cat-hourly')).toBe(true);
  });

  it('preserves dirty edits and locally added rows across a refetch', () => {
    const current: CustomFormState = {
      'cat-hourly': {
        rows: [
          row({ key: 'entry-h1', entryId: 'h1', hour: 1, value: '99' }),
          row({ key: 'new-1', entryId: null, hour: 4, value: '40' }),
        ],
        deleted: [],
      },
    };

    const { form } = syncCustomForm({
      categories: [numericCat('Hourly')],
      serverEntries: [entry('h1', 'cat-hourly', '10', { entry_hour: 1 })],
      current,
      dirtyKeys: new Set(['entry-h1', 'new-1']),
    });

    const byKey = new Map(form['cat-hourly'].rows.map((r) => [r.key, r]));
    expect(byKey.get('entry-h1')).toMatchObject({ entryId: 'h1', value: '99' });
    expect(byKey.get('new-1')).toMatchObject({ entryId: null, value: '40' });
    expect(form['cat-hourly'].rows).toHaveLength(2);
  });
});

describe('buildCustomOps', () => {
  it('never re-sends unchanged rows, including unchanged Unlimited entries', () => {
    const form: CustomFormState = {
      'cat-unlimited': { rows: [row({ key: 'entry-u1', entryId: 'u1', value: '100' })], deleted: [] },
    };

    const result = buildCustomOps({ categories: [numericCat('Unlimited')], form, dirtyKeys: new Set() });

    expect(result).toEqual({ ok: true, operations: [] });
  });

  it('emits a single POST for a new Unlimited row', () => {
    const form: CustomFormState = {
      'cat-unlimited': { rows: [row({ key: 'new-1', value: '100', timestamp: '2026-07-30T08:00:00Z' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [numericCat('Unlimited')],
      form,
      dirtyKeys: new Set(['new-1']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        {
          kind: 'save',
          categoryId: 'cat-unlimited',
          entryId: null,
          value: 100,
          hour: null,
          timestamp: '2026-07-30T08:00:00Z',
        },
      ]);
    }
  });

  it('emits a PUT-by-id save for an edited existing row', () => {
    const form: CustomFormState = {
      'cat-unlimited': {
        rows: [row({ key: 'entry-u1', entryId: 'u1', value: '150', timestamp: '2026-07-30T08:00:00Z' })],
        deleted: [],
      },
    };

    const result = buildCustomOps({
      categories: [numericCat('Unlimited')],
      form,
      dirtyKeys: new Set(['entry-u1']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        {
          kind: 'save',
          categoryId: 'cat-unlimited',
          entryId: 'u1',
          value: 150,
          hour: null,
          timestamp: '2026-07-30T08:00:00Z',
        },
      ]);
    }
  });

  it('turns a cleared existing row into a delete-by-id operation', () => {
    const form: CustomFormState = {
      'cat-unlimited': { rows: [row({ key: 'entry-u1', entryId: 'u1', value: '' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [numericCat('Unlimited')],
      form,
      dirtyKeys: new Set(['entry-u1']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([{ kind: 'delete', entryId: 'u1', categoryId: 'cat-unlimited' }]);
    }
  });

  it('emits delete ops for rows marked deleted even when nothing else changed', () => {
    const form: CustomFormState = {
      'cat-unlimited': { rows: [], deleted: [{ entryId: 'u9' }] },
    };

    const result = buildCustomOps({ categories: [numericCat('Unlimited')], form, dirtyKeys: new Set() });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([{ kind: 'delete', entryId: 'u9', categoryId: 'cat-unlimited' }]);
    }
  });

  it('produces a boolean save op from the tri-state string', () => {
    const form: CustomFormState = {
      'cat-bool': { rows: [row({ key: 'entry-b1', entryId: 'b1', value: 'false' })], deleted: [] },
    };

    const result = buildCustomOps({ categories: [boolCat], form, dirtyKeys: new Set(['entry-b1']) });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations[0]).toMatchObject({ kind: 'save', value: 'false' });
    }
  });

  it('aborts on an invalid changed row and reports its label', () => {
    const onInvalid = jest.fn();
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'entry-e1', entryId: 'e1', value: 'abc' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [numericCat('Daily')],
      form,
      dirtyKeys: new Set(['entry-e1']),
      onInvalid,
    });

    expect(result).toEqual({ ok: false });
    expect(onInvalid).toHaveBeenCalledWith('cat-daily');
  });

  it('does not validate unchanged rows, so a bad historical value cannot block a save', () => {
    const onInvalid = jest.fn();
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'entry-e1', entryId: 'e1', value: 'abc' })], deleted: [] },
    };

    const result = buildCustomOps({ categories: [numericCat('Daily')], form, dirtyKeys: new Set(), onInvalid });

    expect(result).toEqual({ ok: true, operations: [] });
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it('returns zero custom operations when only built-in fields are dirty', () => {
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'entry-e1', entryId: 'e1', value: '120' })], deleted: [] },
    };

    const result = buildCustomOps({ categories: [numericCat('Daily')], form, dirtyKeys: new Set() });

    expect(result).toEqual({ ok: true, operations: [] });
  });
});

describe('entryTimestampFor', () => {
  it('builds a local-timezone timestamp on the selected day for a historical date', () => {
    const iso = entryTimestampFor('2026-01-05', 14);

    expect(iso.startsWith('2026-01-05')).toBe(true);
    const date = new Date(iso);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(5);
    expect(date.getHours()).toBe(14);
  });

  it('keeps the Hourly entry_hour in the serialized timestamp', () => {
    const iso = entryTimestampFor('2026-07-30', 7);

    const date = new Date(iso);
    expect(date.getHours()).toBe(7);
    expect(date.getDate()).toBe(30);
    expect(date.getMonth()).toBe(6);
  });

  it('respects an optional minutes offset', () => {
    const iso = entryTimestampFor('2026-07-30', 9, { minutes: 30 });

    const date = new Date(iso);
    expect(date.getHours()).toBe(9);
    expect(date.getMinutes()).toBe(30);
  });
});

describe('findHourlyHourConflict', () => {
  const hourlyCat = numericCat('Hourly');

  it('returns null when distinct hours are selected', () => {
    const form: CustomFormState = {
      'cat-hourly': {
        rows: [
          row({ key: 'new-1', entryId: null, hour: 8, source: 'manual', value: '80' }),
          row({ key: 'new-2', entryId: null, hour: 17, source: 'manual', value: '120' }),
        ],
        deleted: [],
      },
    };

    expect(findHourlyHourConflict({ categories: [hourlyCat], form, serverEntries: [] })).toBeNull();
  });

  it('flags two local rows sharing the same hour and source', () => {
    const form: CustomFormState = {
      'cat-hourly': {
        rows: [
          row({ key: 'new-1', entryId: null, hour: 9, source: 'manual', value: '80' }),
          row({ key: 'new-2', entryId: null, hour: 9, source: 'manual', value: '120' }),
        ],
        deleted: [],
      },
    };

    expect(findHourlyHourConflict({ categories: [hourlyCat], form, serverEntries: [] })).toEqual({
      categoryId: 'cat-hourly',
      hour: 9,
    });
  });

  it('flags a new row that collides with a same-source server entry at that hour', () => {
    const form: CustomFormState = {
      'cat-hourly': {
        rows: [row({ key: 'new-1', entryId: null, hour: 8, source: 'manual', value: '80' })],
        deleted: [],
      },
    };

    expect(
      findHourlyHourConflict({
        categories: [hourlyCat],
        form,
        serverEntries: [entry('h8', 'cat-hourly', '75', { entry_hour: 8, source: 'manual' })],
      })
    ).toEqual({ categoryId: 'cat-hourly', hour: 8 });
  });

  it('does not conflict with a server entry at the same hour but a different source', () => {
    const form: CustomFormState = {
      'cat-hourly': {
        rows: [row({ key: 'new-1', entryId: null, hour: 8, source: 'manual', value: '80' })],
        deleted: [],
      },
    };

    expect(
      findHourlyHourConflict({
        categories: [hourlyCat],
        form,
        serverEntries: [entry('h8', 'cat-hourly', '75', { entry_hour: 8, source: 'apple_health' })],
      })
    ).toBeNull();
  });
});

describe('buildCustomOps - Hourly hours', () => {
  const hourlyCat = numericCat('Hourly');

  it('saves distinct Hourly hours as separate rows', () => {
    const form: CustomFormState = {
      'cat-hourly': {
        rows: [
          row({ key: 'new-1', hour: 8, timestamp: '2026-07-30T08:00:00.000Z', value: '80' }),
          row({ key: 'new-2', hour: 17, timestamp: '2026-07-30T17:00:00.000Z', value: '120' }),
        ],
        deleted: [],
      },
    };

    const result = buildCustomOps({
      categories: [hourlyCat],
      form,
      dirtyKeys: new Set(['new-1', 'new-2']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        {
          kind: 'save',
          categoryId: 'cat-hourly',
          entryId: null,
          value: 80,
          hour: 8,
          timestamp: '2026-07-30T08:00:00.000Z',
        },
        {
          kind: 'save',
          categoryId: 'cat-hourly',
          entryId: null,
          value: 120,
          hour: 17,
          timestamp: '2026-07-30T17:00:00.000Z',
        },
      ]);
    }
  });

  it('blocks an out-of-range hour', () => {
    const form: CustomFormState = {
      'cat-hourly': {
        rows: [row({ key: 'new-1', hour: 24, value: '80' })],
        deleted: [],
      },
    };

    const result = buildCustomOps({
      categories: [hourlyCat],
      form,
      dirtyKeys: new Set(['new-1']),
    });

    expect(result).toEqual({ ok: false });
  });

  it('blocks a negative hour', () => {
    const form: CustomFormState = {
      'cat-hourly': {
        rows: [row({ key: 'new-1', hour: -1, value: '80' })],
        deleted: [],
      },
    };

    const result = buildCustomOps({
      categories: [hourlyCat],
      form,
      dirtyKeys: new Set(['new-1']),
    });

    expect(result).toEqual({ ok: false });
  });
});

describe('syncCustomForm - tombstone resurrection guard', () => {
  it('keeps a tombstoned id out of rows and in deleted when the server still returns it', () => {
    const current: CustomFormState = {
      'cat-hourly': {
        rows: [],
        deleted: [{ entryId: 'h5' }],
      },
    };

    const { form } = syncCustomForm({
      categories: [numericCat('Hourly')],
      serverEntries: [
        entry('h5', 'cat-hourly', '50', { entry_hour: 5 }),
        entry('h6', 'cat-hourly', '60', { entry_hour: 6 }),
      ],
      current,
      dirtyKeys: new Set(),
    });

    const rows = form['cat-hourly'].rows;
    expect(rows.map((r) => r.entryId)).toEqual(['h6']);
    expect(form['cat-hourly'].deleted).toEqual([{ entryId: 'h5' }]);
  });

  it('drops the tombstone once the server stops returning the deleted id', () => {
    const current: CustomFormState = {
      'cat-hourly': {
        rows: [],
        deleted: [{ entryId: 'h5' }],
      },
    };

    const { form } = syncCustomForm({
      categories: [numericCat('Hourly')],
      serverEntries: [],
      current,
      dirtyKeys: new Set(),
    });

    expect(form['cat-hourly'].deleted).toEqual([]);
  });
});

describe('buildCustomOps - tombstone deletes', () => {
  it('emits exactly one DELETE for a tombstoned Hourly entry', () => {
    const form: CustomFormState = {
      'cat-hourly': {
        rows: [row({ key: 'entry-h6', entryId: 'h6', hour: 6, value: '60' })],
        deleted: [{ entryId: 'h5' }],
      },
    };

    const result = buildCustomOps({
      categories: [numericCat('Hourly')],
      form,
      dirtyKeys: new Set(['entry-h6']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        { kind: 'delete', entryId: 'h5', categoryId: 'cat-hourly' },
        {
          kind: 'save',
          categoryId: 'cat-hourly',
          entryId: 'h6',
          value: 60,
          hour: 6,
          timestamp: null,
        },
      ]);
    }
  });

  it('emits a single delete and no resurrected row when the server returns the id after a failed delete', () => {
    const current: CustomFormState = {
      'cat-hourly': {
        rows: [],
        deleted: [{ entryId: 'h5' }],
      },
    };

    // The server still reports h5 (DELETE failed or is mid-flight): the row must
    // not come back, and the tombstone must survive to retry exactly one delete.
    const { form } = syncCustomForm({
      categories: [numericCat('Hourly')],
      serverEntries: [entry('h5', 'cat-hourly', '50', { entry_hour: 5 })],
      current,
      dirtyKeys: new Set(),
    });

    expect(form['cat-hourly'].rows).toEqual([]);
    expect(form['cat-hourly'].deleted).toEqual([{ entryId: 'h5' }]);

    const result = buildCustomOps({
      categories: [numericCat('Hourly')],
      form,
      dirtyKeys: new Set(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([{ kind: 'delete', entryId: 'h5', categoryId: 'cat-hourly' }]);
    }
  });
});

describe('emptyFormFor', () => {
  it('creates an empty form for every category', () => {
    const form = emptyFormFor([numericCat('Daily', 'cat-a'), numericCat('Unlimited', 'cat-b')]);

    expect(form).toEqual({
      'cat-a': { rows: [], deleted: [] },
      'cat-b': { rows: [], deleted: [] },
    });
  });
});
