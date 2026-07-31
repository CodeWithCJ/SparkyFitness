import {
  isMultiEntryFrequency,
  rowValue,
  syncCustomForm,
  buildCustomOps,
  emptyFormFor,
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

describe('emptyFormFor', () => {
  it('creates an empty form for every category', () => {
    const form = emptyFormFor([numericCat('Daily', 'cat-a'), numericCat('Unlimited', 'cat-b')]);

    expect(form).toEqual({
      'cat-a': { rows: [], deleted: [] },
      'cat-b': { rows: [], deleted: [] },
    });
  });
});
