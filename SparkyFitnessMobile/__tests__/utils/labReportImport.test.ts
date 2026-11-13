import type { LabReportScanResult } from '@workspace/shared';
import { labImportBody, planLabImport } from '../../src/utils/labReportImport';
import { buildLabMarkers } from '../../src/utils/labResults';

const scanned = (
  overrides: Partial<LabReportScanResult>
): LabReportScanResult => ({
  name: 'LDL',
  value: 130,
  unit: 'mg/dL',
  ref_low: null,
  ref_high: 99,
  marker_key: 'ldl',
  ...overrides,
});

const latest = (overrides: Record<string, unknown>) => ({
  id: 'r1',
  user_id: 'u1',
  marker_key: null,
  custom_marker_id: null,
  entry_date: '2026-03-01',
  value_numeric: 100,
  value_text: null,
  unit: 'mg/dL',
  ref_range_low: null,
  ref_range_high: null,
  lab_name: null,
  notes: null,
  source: 'manual' as const,
  created_at: '2026-03-01T10:00:00.000Z',
  updated_at: '2026-03-01T10:00:00.000Z',
  ...overrides,
});

const custom = (name: string, id = 'm1') => ({
  id,
  user_id: 'u1',
  name,
  unit: 'mg/dL',
  ref_range_low: null,
  ref_range_high: 90,
  created_at: '2026-03-01T10:00:00.000Z',
  updated_at: '2026-03-01T10:00:00.000Z',
});

describe('planLabImport', () => {
  const noMarkers = buildLabMarkers([], []);

  it('matches a recognised name to its built-in marker', () => {
    const [row] = planLabImport([scanned({})], noMarkers, {}, null);
    expect(row?.target).toMatchObject({ kind: 'builtin' });
    expect(row?.title).toBe('LDL Cholesterol');
    expect(row?.blocked).toBeNull();
  });

  it('titles a built-in marker from the localized labels', () => {
    const [row] = planLabImport(
      [scanned({})],
      noMarkers,
      { ldl: 'LDL pl' },
      null
    );
    expect(row?.title).toBe('LDL pl');
  });

  it('keeps the unit and the range the report printed', () => {
    const [row] = planLabImport(
      [scanned({ unit: 'mg/dL', ref_low: 40, ref_high: 99 })],
      noMarkers,
      {},
      null
    );
    expect(row?.unit).toBe('mg/dL');
    expect(row?.range).toEqual({ low: 40, high: 99 });
    expect(row?.reportRange).toEqual({ low: 40, high: 99 });
  });

  it('takes the preset range for the profile sex when the report prints none', () => {
    const [male] = planLabImport(
      [
        scanned({
          name: 'Hemoglobin',
          marker_key: 'hemoglobin',
          unit: 'g/dL',
          ref_low: null,
          ref_high: null,
        }),
      ],
      noMarkers,
      {},
      'male'
    );
    expect(male?.reportRange).toBeNull();
    expect(male?.range.low).toBe(13.5);
  });

  it('gives no default range to a result printed in another unit', () => {
    const [row] = planLabImport(
      [scanned({ unit: 'mmol/L', ref_low: null, ref_high: null, value: 3.4 })],
      noMarkers,
      {},
      null
    );
    expect(row?.reportRange).toBeNull();
    expect(row?.range).toEqual({ low: null, high: null });
  });

  it('uses the marker unit when the report prints none', () => {
    const [row] = planLabImport([scanned({ unit: null })], noMarkers, {}, null);
    expect(row?.unit).toBe('mg/dL');
  });

  it('matches an unrecognised name to one of the user markers, ignoring case', () => {
    const markers = buildLabMarkers([custom('ApoB')], []);
    const [row] = planLabImport(
      [scanned({ name: 'apob', marker_key: null, ref_high: 90 })],
      markers,
      {},
      null
    );
    expect(row?.target).toEqual({
      kind: 'custom',
      name: 'ApoB',
      existing: true,
    });
    expect(row?.title).toBe('ApoB');
  });

  it('makes a new marker of an unknown name', () => {
    const [row] = planLabImport(
      [scanned({ name: ' Lp(a) ', marker_key: null, unit: 'nmol/L' })],
      noMarkers,
      {},
      null
    );
    expect(row?.target).toEqual({
      kind: 'custom',
      name: 'Lp(a)',
      existing: false,
    });
    expect(row?.unit).toBe('nmol/L');
  });

  it('blocks a second result for the same marker in one report', () => {
    const rows = planLabImport(
      [scanned({}), scanned({ value: 128 })],
      noMarkers,
      {},
      null
    );
    expect(rows.map((r) => r.blocked)).toEqual([null, 'duplicate']);
  });

  it('flags a unit that differs from the earlier results, without blocking', () => {
    const markers = buildLabMarkers(
      [],
      [latest({ marker_key: 'ldl', unit: 'mg/dL' })]
    );
    const [row] = planLabImport(
      [scanned({ unit: 'mmol/L', value: 3.4 })],
      markers,
      {},
      null
    );
    expect(row?.warning).toBe('unit_differs');
    expect(row?.earlierUnit).toBe('mg/dL');
    expect(row?.blocked).toBeNull();
  });

  it('does not flag the same unit spelled differently', () => {
    const markers = buildLabMarkers(
      [],
      [latest({ marker_key: 'tsh', unit: 'mIU/L' })]
    );
    const [row] = planLabImport(
      [scanned({ name: 'TSH', marker_key: 'tsh', unit: 'uIU/mL' })],
      markers,
      {},
      null
    );
    expect(row?.warning).toBeNull();
  });

  it('does not flag sodium printed in mEq/L after results in mmol/L', () => {
    const markers = buildLabMarkers(
      [],
      [latest({ marker_key: 'sodium', unit: 'mmol/L' })]
    );
    const [row] = planLabImport(
      [
        scanned({
          name: 'Sodium',
          marker_key: 'sodium',
          unit: 'mEq/L',
          value: 140,
        }),
      ],
      markers,
      {},
      null
    );
    expect(row?.warning).toBeNull();
  });

  it('does not flag a marker with no earlier results', () => {
    const [row] = planLabImport(
      [scanned({ unit: 'mmol/L' })],
      noMarkers,
      {},
      null
    );
    expect(row?.warning).toBeNull();
  });
});

describe('labImportBody', () => {
  it('builds one report with each result keeping its unit and range', () => {
    const rows = planLabImport(
      [
        scanned({ ref_low: 40, ref_high: 99 }),
        scanned({
          name: 'Lp(a)',
          marker_key: null,
          unit: 'nmol/L',
          value: 50,
          ref_low: null,
          ref_high: 75,
        }),
      ],
      buildLabMarkers([], []),
      {},
      null
    );

    const body = labImportBody(rows, {
      labName: 'Quest',
      date: '2026-09-12',
      values: { '0': 97 },
    });

    expect(body).toEqual({
      lab_name: 'Quest',
      entry_date: '2026-09-12',
      results: [
        {
          marker_key: 'ldl',
          value_numeric: 97,
          unit: 'mg/dL',
          ref_range_low: 40,
          ref_range_high: 99,
        },
        {
          marker_name: 'Lp(a)',
          value_numeric: 50,
          unit: 'nmol/L',
          ref_range_low: null,
          ref_range_high: 75,
        },
      ],
    });
  });

  it('carries the client key only when one is given', () => {
    const rows = planLabImport(
      [scanned({})],
      buildLabMarkers([], []),
      {},
      null
    );
    const options = { labName: null, date: '2026-09-12', values: {} };

    expect(labImportBody(rows, options)).not.toHaveProperty(
      'client_request_id'
    );
    expect(
      labImportBody(rows, {
        ...options,
        clientRequestId: '11111111-1111-4111-8111-111111111111',
      }).client_request_id
    ).toBe('11111111-1111-4111-8111-111111111111');
  });
});
