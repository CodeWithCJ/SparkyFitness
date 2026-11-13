import { describe, expect, it } from 'vitest';
import {
  createLabMarkerBodySchema,
  createLabResultBodySchema,
  labResultListQuerySchema,
  updateLabMarkerBodySchema,
  updateLabResultBodySchema,
} from '@workspace/shared';

const MARKER_ID = '3f2b8f0e-6a3a-4d6f-9d0e-2f7c5a1b9c11';

describe('createLabResultBodySchema', () => {
  const valid = {
    marker_key: 'hba1c',
    entry_date: '2026-09-12',
    value_numeric: 5.1,
    unit: '%',
  };

  it('accepts a result for a built-in marker', () => {
    const parsed = createLabResultBodySchema.parse(valid);
    expect(parsed.source).toBe('manual');
  });

  it('accepts a result for a custom marker', () => {
    expect(
      createLabResultBodySchema.safeParse({
        custom_marker_id: MARKER_ID,
        entry_date: '2026-09-12',
        value_numeric: 12,
      }).success
    ).toBe(true);
  });

  it('accepts a text-only result', () => {
    expect(
      createLabResultBodySchema.safeParse({
        marker_key: 'hba1c',
        entry_date: '2026-09-12',
        value_text: 'Negative',
      }).success
    ).toBe(true);
  });

  it('needs exactly one marker', () => {
    expect(
      createLabResultBodySchema.safeParse({ ...valid, marker_key: undefined })
        .success
    ).toBe(false);
    expect(
      createLabResultBodySchema.safeParse({
        ...valid,
        custom_marker_id: MARKER_ID,
      }).success
    ).toBe(false);
  });

  it('rejects an unknown built-in key', () => {
    expect(
      createLabResultBodySchema.safeParse({ ...valid, marker_key: 'nope' })
        .success
    ).toBe(false);
  });

  it('needs a value', () => {
    expect(
      createLabResultBodySchema.safeParse({
        marker_key: 'hba1c',
        entry_date: '2026-09-12',
      }).success
    ).toBe(false);
  });

  it('rejects a bad date and a reversed range', () => {
    expect(
      createLabResultBodySchema.safeParse({
        ...valid,
        entry_date: '12/09/2026',
      }).success
    ).toBe(false);
    const reversed = createLabResultBodySchema.safeParse({
      ...valid,
      ref_range_low: 6,
      ref_range_high: 5,
    });
    expect(reversed.success).toBe(false);
  });

  it('rejects dates that are not on the calendar', () => {
    for (const entry_date of ['2026-02-31', '2026-13-45', '2025-02-29']) {
      expect(
        createLabResultBodySchema.safeParse({ ...valid, entry_date }).success
      ).toBe(false);
    }
    expect(
      createLabResultBodySchema.safeParse({
        ...valid,
        entry_date: '2024-02-29',
      }).success
    ).toBe(true);
  });

  it('allows a one-sided range', () => {
    expect(
      createLabResultBodySchema.safeParse({ ...valid, ref_range_high: 5.6 })
        .success
    ).toBe(true);
  });
});

describe('updateLabResultBodySchema', () => {
  it('lets a bound be cleared with null', () => {
    const parsed = updateLabResultBodySchema.parse({ ref_range_high: null });
    expect(parsed.ref_range_high).toBeNull();
  });

  it('does not accept a change of marker', () => {
    const parsed = updateLabResultBodySchema.parse({
      marker_key: 'ldl',
      notes: 'x',
    });
    expect('marker_key' in parsed).toBe(false);
  });

  it('rejects a reversed range sent together', () => {
    expect(
      updateLabResultBodySchema.safeParse({
        ref_range_low: 6,
        ref_range_high: 5,
      }).success
    ).toBe(false);
  });
});

describe('lab marker bodies', () => {
  it('requires a name and defaults the unit', () => {
    expect(createLabMarkerBodySchema.safeParse({ name: '  ' }).success).toBe(
      false
    );
    expect(createLabMarkerBodySchema.parse({ name: 'ApoB' }).unit).toBe('');
  });

  it('rejects a reversed range on create and update', () => {
    const range = { ref_range_low: 9, ref_range_high: 3 };
    expect(
      createLabMarkerBodySchema.safeParse({ name: 'ApoB', ...range }).success
    ).toBe(false);
    expect(updateLabMarkerBodySchema.safeParse(range).success).toBe(false);
  });
});

describe('labResultListQuerySchema', () => {
  it('applies a default limit and coerces it', () => {
    expect(labResultListQuerySchema.parse({}).limit).toBe(1000);
    expect(labResultListQuerySchema.parse({ limit: '25' }).limit).toBe(25);
  });

  it('rejects a filter date that is not on the calendar', () => {
    expect(
      labResultListQuerySchema.safeParse({ startDate: '2026-02-31' }).success
    ).toBe(false);
    expect(
      labResultListQuerySchema.safeParse({ endDate: '2026-04-31' }).success
    ).toBe(false);
  });

  it('rejects both marker filters at once', () => {
    expect(
      labResultListQuerySchema.safeParse({
        markerKey: 'hba1c',
        markerId: MARKER_ID,
      }).success
    ).toBe(false);
  });
});
