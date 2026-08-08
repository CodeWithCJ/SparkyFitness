import {
  rowValue,
  syncCustomForm,
  buildCustomOps,
  emptyFormFor,
  isManualSource,
  type CustomCategoryMeta,
  type CustomFormState,
  type CustomRow,
} from '../../src/utils/customMeasurementsForm';
import type { CustomMeasurementEntry } from '../../src/types/customMeasurements';

const dailyCat = (id: string, dataType = 'numeric'): CustomCategoryMeta => ({
  id,
  name: id,
  display_name: id,
  data_type: dataType,
});

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
  // The DB column is NOT NULL DEFAULT 'manual', so manual is the default here;
  // synced/null cases override it explicitly.
  source: 'manual',
  ...extra,
});

const row = (overrides: Partial<CustomRow> & { key: string }): CustomRow => ({
  entryId: null,
  source: 'manual',
  value: '',
  ...overrides,
});

describe('isManualSource', () => {
  it('only treats the literal string manual as manual (strict DB contract)', () => {
    expect(isManualSource('manual')).toBe(true);
    // The DB column is NOT NULL DEFAULT 'manual' — null/undefined are NOT
    // manual, matching the strict maintainer contract.
    expect(isManualSource(null)).toBe(false);
    expect(isManualSource(undefined)).toBe(false);
  });

  it('treats every health-sync source as non-manual', () => {
    for (const source of ['healthkit', 'health_connect', 'garmin', 'oura', 'fitbit', 'polar', 'withings', 'google']) {
      expect(isManualSource(source)).toBe(false);
    }
  });
});

describe('rowValue', () => {
  it('parses numeric values', () => {
    expect(rowValue('75', 'numeric')).toBe(75);
    expect(rowValue('75.5', 'numeric')).toBe(75.5);
  });

  it('returns null for empty or non-numeric numeric values', () => {
    expect(rowValue('', 'numeric')).toBeNull();
    expect(rowValue('abc', 'numeric')).toBeNull();
  });

  it('parses locale decimal separators (Polish comma)', () => {
    expect(rowValue('1,5', 'numeric')).toBe(1.5);
  });

  it('keeps zero as a real value, not an empty state', () => {
    expect(rowValue('0', 'numeric')).toBe(0);
    expect(rowValue('0,0', 'numeric')).toBe(0);
  });

  it('keeps negative numeric values (API has no min constraint)', () => {
    expect(rowValue('-5', 'numeric')).toBe(-5);
  });

  it('maps boolean data types to the server boolean strings', () => {
    expect(rowValue('true', 'boolean')).toBe('true');
    expect(rowValue('false', 'boolean')).toBe('false');
    // 'false' is a REAL value: it must not collapse to null/empty.
    expect(rowValue('false', 'boolean')).not.toBeNull();
    expect(rowValue('', 'boolean')).toBeNull();
  });

  it('passes text values through trimmed', () => {
    expect(rowValue('  hello  ', 'text')).toBe('hello');
  });
});

describe('syncCustomForm', () => {
  it('keeps dirty values across a refetch while untouched rows mirror the server', () => {
    const current: CustomFormState = {
      'cat-daily': {
        rows: [row({ key: 'k1', entryId: 'e1', value: '99' })],
        deleted: [],
      },
    };

    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      serverEntries: [entry('e1', 'cat-daily', '50')],
      current,
      dirtyKeys: new Set(['k1']),
    });

    expect(form['cat-daily'].rows[0].value).toBe('99');
    expect(form['cat-daily'].rows[0].entryId).toBe('e1');
  });

  it('mirrors server values for untouched rows', () => {
    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      serverEntries: [entry('e1', 'cat-daily', '50')],
      current: {},
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows[0].value).toBe('50');
    expect(form['cat-daily'].rows[0].entryId).toBe('e1');
  });

  it('drops non-dirty rows whose server entry disappeared', () => {
    const current: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'k1', entryId: 'e1', value: '50' })], deleted: [] },
    };

    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      serverEntries: [],
      current,
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows).toEqual([]);
  });

  it('keeps dirty rows whose server entry disappeared as new rows', () => {
    const current: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'k1', entryId: 'e1', value: '99' })], deleted: [] },
    };

    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      serverEntries: [],
      current,
      dirtyKeys: new Set(['k1']),
    });

    expect(form['cat-daily'].rows).toEqual([
      expect.objectContaining({ key: 'k1', entryId: null, value: '99' }),
    ]);
  });

  it('excludes synced entries: they never become editable manual rows', () => {
    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      // Only a healthkit entry exists for this category.
      serverEntries: [entry('e1', 'cat-daily', '75', { source: 'healthkit' })],
      current: {},
      dirtyKeys: new Set(),
    });

    // The synced entry must NOT prefill the manual editor.
    expect(form['cat-daily'].rows).toEqual([]);
    expect(form['cat-daily'].deleted).toEqual([]);
  });

  it('excludes a null-source entry: it never prefills the manual editor', () => {
    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      // A legacy entry with no source column value: the DB contract has
      // NOT NULL DEFAULT 'manual', so null is NOT manual and must not prefill.
      serverEntries: [entry('e1', 'cat-daily', '75', { source: null })],
      current: {},
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows).toEqual([]);
    expect(form['cat-daily'].deleted).toEqual([]);
  });

  it('excludes a missing/undefined source entry', () => {
    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      serverEntries: [entry('e1', 'cat-daily', '75', { source: undefined })],
      current: {},
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows).toEqual([]);
  });

  it('keeps a manual entry alongside a synced entry for the same category', () => {
    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      serverEntries: [
        entry('e-sync', 'cat-daily', '80', { source: 'garmin' }),
        entry('e-manual', 'cat-daily', '70', { source: 'manual' }),
      ],
      current: {},
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows).toHaveLength(1);
    expect(form['cat-daily'].rows[0].entryId).toBe('e-manual');
    expect(form['cat-daily'].rows[0].value).toBe('70');
  });
});

describe('syncCustomForm - tombstone resurrection guard', () => {
  it('keeps a tombstoned Daily id out of rows and in deleted when the server still returns it', () => {
    const current: CustomFormState = {
      'cat-daily': {
        rows: [],
        deleted: [{ entryId: 'e1' }],
      },
    };

    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      serverEntries: [entry('e1', 'cat-daily', '50', { source: 'manual' })],
      current,
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows).toEqual([]);
    expect(form['cat-daily'].deleted).toEqual([{ entryId: 'e1' }]);
  });

  it('drops a Daily tombstone once the server stops returning the id', () => {
    const current: CustomFormState = {
      'cat-daily': {
        rows: [],
        deleted: [{ entryId: 'e1' }],
      },
    };

    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      serverEntries: [],
      current,
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows).toEqual([]);
    expect(form['cat-daily'].deleted).toEqual([]);
  });
});

describe('buildCustomOps', () => {
  it('never re-sends unchanged rows', () => {
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'k1', entryId: 'e1', value: '50' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.operations).toEqual([]);
  });

  it('emits a POST with manual source for a changed existing row', () => {
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'k1', entryId: 'e1', value: '60' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(['k1']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        { kind: 'save', categoryId: 'cat-daily', value: 60, source: 'manual', rowKey: 'k1' },
      ]);
    }
  });

  it('uses manual source for a new locally-added row (never a preserved synced source)', () => {
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'new-1', value: '10' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(['new-1']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        { kind: 'save', categoryId: 'cat-daily', value: 10, source: 'manual', rowKey: 'new-1' },
      ]);
    }
  });

  it('keeps zero and false as real values in the save op', () => {
    const form: CustomFormState = {
      'cat-num': { rows: [row({ key: 'k0', entryId: 'e0', value: '0' })], deleted: [] },
      'cat-bool': {
        rows: [row({ key: 'kf', entryId: 'e1', value: 'false' })],
        deleted: [],
      },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-num'), dailyCat('cat-bool', 'boolean')],
      form,
      dirtyKeys: new Set(['k0', 'kf']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        { kind: 'save', categoryId: 'cat-num', value: 0, source: 'manual', rowKey: 'k0' },
        { kind: 'save', categoryId: 'cat-bool', value: 'false', source: 'manual', rowKey: 'kf' },
      ]);
    }
  });

  it('parses Polish comma decimals in the save op', () => {
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'k1', value: '1,5' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(['k1']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations[0]).toEqual(
        expect.objectContaining({ value: 1.5, source: 'manual' }),
      );
    }
  });

  it('turns a cleared existing row into a delete-by-id operation', () => {
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'k1', entryId: 'e1', value: '' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(['k1']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        { kind: 'delete', entryId: 'e1', categoryId: 'cat-daily', rowKey: 'k1' },
      ]);
    }
  });

  it('emits delete ops for rows marked deleted even when nothing else changed', () => {
    const form: CustomFormState = {
      'cat-daily': { rows: [], deleted: [{ entryId: 'e1' }] },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        { kind: 'delete', entryId: 'e1', categoryId: 'cat-daily', rowKey: 'e1' },
      ]);
    }
  });

  it('produces a boolean save op from the tri-state string', () => {
    const form: CustomFormState = {
      'cat-bool': { rows: [row({ key: 'k1', value: 'true' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-bool', 'boolean')],
      form,
      dirtyKeys: new Set(['k1']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations[0]).toEqual(
        expect.objectContaining({ value: 'true', source: 'manual' }),
      );
    }
  });

  it('aborts on an invalid changed row and reports its label', () => {
    const onInvalid = jest.fn();
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'k1', value: 'abc' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(['k1']),
      onInvalid,
    });

    expect(result.ok).toBe(false);
    expect(onInvalid).toHaveBeenCalledWith('cat-daily');
  });

  it('does not validate unchanged rows, so a bad historical value cannot block a save', () => {
    const form: CustomFormState = {
      'cat-daily': { rows: [row({ key: 'k1', entryId: 'e1', value: 'not-a-number' })], deleted: [] },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.operations).toEqual([]);
  });

  it('returns zero custom operations when only built-in fields are dirty', () => {
    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form: {},
      dirtyKeys: new Set(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.operations).toEqual([]);
  });
});

describe('buildCustomOps - tombstone deletes', () => {
  it('emits exactly one DELETE for a tombstoned Daily entry', () => {
    const form: CustomFormState = {
      'cat-daily': {
        rows: [row({ key: 'k1', entryId: 'e1', value: '60' })],
        deleted: [{ entryId: 'e-del' }],
      },
    };

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(['k1']),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        { kind: 'delete', entryId: 'e-del', categoryId: 'cat-daily', rowKey: 'e-del' },
        { kind: 'save', categoryId: 'cat-daily', value: 60, source: 'manual', rowKey: 'k1' },
      ]);
    }
  });

  it('emits a single delete and no resurrected row when the server returns the id after a failed delete', () => {
    const current: CustomFormState = {
      'cat-daily': {
        rows: [],
        deleted: [{ entryId: 'e1' }],
      },
    };

    // The server still reports e1 (DELETE failed or is mid-flight): the row
    // must not come back, and the tombstone must survive to retry exactly one
    // delete.
    const { form } = syncCustomForm({
      categories: [dailyCat('cat-daily')],
      serverEntries: [entry('e1', 'cat-daily', '50', { source: 'manual' })],
      current,
      dirtyKeys: new Set(),
    });

    expect(form['cat-daily'].rows).toEqual([]);
    expect(form['cat-daily'].deleted).toEqual([{ entryId: 'e1' }]);

    const result = buildCustomOps({
      categories: [dailyCat('cat-daily')],
      form,
      dirtyKeys: new Set(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.operations).toEqual([
        { kind: 'delete', entryId: 'e1', categoryId: 'cat-daily', rowKey: 'e1' },
      ]);
    }
  });
});

describe('emptyFormFor', () => {
  it('creates an empty form for every category', () => {
    const form = emptyFormFor([dailyCat('cat-a'), dailyCat('cat-b')]);
    expect(form).toEqual({
      'cat-a': { rows: [], deleted: [] },
      'cat-b': { rows: [], deleted: [] },
    });
  });
});
