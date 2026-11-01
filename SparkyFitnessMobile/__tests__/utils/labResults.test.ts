import type { LabMarkerResponse, LabResultResponse } from '@workspace/shared';
import {
  buildLabMarkers,
  buildLabPickerOptions,
  formatLabRange,
  formatLabValue,
  labHistoryPoints,
  labMarkerQueryFromId,
  labPresetDefaults,
  labPresetName,
  labResultStatus,
  labResultText,
  labSexFromGender,
  parseLabValue,
  parseRangeBound,
} from '../../src/utils/labResults';
import i18n, { initializeI18n } from '../../src/localization/i18n';

const result = (overrides: Partial<LabResultResponse>): LabResultResponse => ({
  id: 'r1',
  user_id: 'u1',
  marker_key: 'hba1c',
  custom_marker_id: null,
  entry_date: '2026-09-12',
  value_numeric: 5.1,
  value_text: null,
  unit: '%',
  ref_range_low: null,
  ref_range_high: null,
  lab_name: null,
  notes: null,
  source: 'manual',
  created_at: '2026-09-12T10:00:00.000Z',
  updated_at: '2026-09-12T10:00:00.000Z',
  ...overrides,
});

const custom = (overrides: Partial<LabMarkerResponse>): LabMarkerResponse => ({
  id: 'm1',
  user_id: 'u1',
  name: 'ApoB',
  unit: 'mg/dL',
  ref_range_low: null,
  ref_range_high: 90,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
  ...overrides,
});

describe('parseLabValue', () => {
  it('parses numbers and decimal commas', () => {
    expect(parseLabValue('5.4')).toBe(5.4);
    expect(parseLabValue(' 5,4 ')).toBe(5.4);
    expect(parseLabValue('0')).toBe(0);
  });
  it('rejects empty, negative and non-numeric input', () => {
    expect(parseLabValue('')).toBeNull();
    expect(parseLabValue('-1')).toBeNull();
    expect(parseLabValue('abc')).toBeNull();
  });
});

describe('parseRangeBound', () => {
  it('treats empty as no bound and junk as invalid', () => {
    expect(parseRangeBound('')).toEqual({ ok: true, value: null });
    expect(parseRangeBound('5.6')).toEqual({ ok: true, value: 5.6 });
    expect(parseRangeBound('x')).toEqual({ ok: false });
  });
});

describe('labResultStatus', () => {
  const fallback = { ref_range_low: 4, ref_range_high: 5.6 };

  it('judges a result by the range saved with it', () => {
    const own = { ref_range_low: 4.8, ref_range_high: 5.2 };
    expect(
      labResultStatus(result({ ...own, value_numeric: 5.4 }), fallback)
    ).toBe('high');
    expect(
      labResultStatus(result({ ...own, value_numeric: 4.5 }), fallback)
    ).toBe('low');
    expect(
      labResultStatus(result({ ...own, value_numeric: 5 }), fallback)
    ).toBe('in_range');
  });

  it('falls back to the marker range when the result has none', () => {
    expect(labResultStatus(result({ value_numeric: 5.4 }), fallback)).toBe(
      'in_range'
    );
    expect(labResultStatus(result({ value_numeric: 6.1 }), fallback)).toBe(
      'high'
    );
  });

  it('treats a one-sided result range as its own range', () => {
    const oneSided = result({ ref_range_high: 5, value_numeric: 5.4 });
    expect(labResultStatus(oneSided, fallback)).toBe('high');
  });

  it('is unknown for a text-only result or when nothing gives a range', () => {
    expect(
      labResultStatus(
        result({ value_numeric: null, value_text: 'Trace' }),
        fallback
      )
    ).toBe('unknown');
    expect(
      labResultStatus(result({ value_numeric: 5 }), {
        ref_range_low: null,
        ref_range_high: null,
      })
    ).toBe('unknown');
  });
});

describe('formatting', () => {
  it('formats ranges and values', () => {
    expect(formatLabRange(4, 5.6, '%')).toBe('4 - 5.6 %');
    expect(formatLabRange(null, 200, 'mg/dL')).toBe('< 200 mg/dL');
    expect(formatLabRange(40, null, 'mg/dL')).toBe('> 40 mg/dL');
    expect(formatLabRange(null, null, '%')).toBeNull();
    expect(formatLabValue(5.4, '%')).toBe('5.4 %');
    expect(formatLabValue(7, '')).toBe('7');
  });

  it('uses the app locale decimal separator', async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('pl');
    try {
      expect(formatLabRange(4, 5.6, '%')).toBe('4 - 5,6 %');
      expect(formatLabRange(null, 0.45, 'mg/dL')).toBe('< 0,45 mg/dL');
      expect(formatLabValue(5.4, '%')).toBe('5,4 %');
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('shows a number with its unit, else the text', () => {
    expect(labResultText(result({ value_numeric: 5.1, unit: '%' }))).toBe(
      '5.1 %'
    );
    expect(
      labResultText(result({ value_numeric: null, value_text: 'Negative' }))
    ).toBe('Negative');
  });
});

describe('labHistoryPoints', () => {
  it('sorts oldest first and drops text-only results', () => {
    const points = labHistoryPoints([
      result({ id: 'a', entry_date: '2026-09-12', value_numeric: 6.1 }),
      result({ id: 'b', entry_date: '2026-03-01', value_numeric: 5.1 }),
      result({
        id: 'c',
        entry_date: '2026-05-01',
        value_numeric: null,
        value_text: 'Trace',
      }),
    ]);
    expect(points).toEqual([
      { day: '2026-03-01', value: 5.1 },
      { day: '2026-09-12', value: 6.1 },
    ]);
  });
});

describe('labMarkerQueryFromId', () => {
  it('reads built-in and custom marker ids', () => {
    expect(labMarkerQueryFromId('builtin:hba1c')).toEqual({
      markerKey: 'hba1c',
    });
    expect(labMarkerQueryFromId('custom:abc-1')).toEqual({ markerId: 'abc-1' });
    expect(labMarkerQueryFromId('nope')).toBeNull();
  });
});

describe('buildLabMarkers', () => {
  const labels = { hba1c: 'Glukoza HbA1c' };

  it('lists built-in markers that have a result and every custom marker', () => {
    const markers = buildLabMarkers(
      [custom({ id: 'm1', name: 'ApoB' }), custom({ id: 'm2', name: 'Zinc' })],
      [
        result({ id: 'r1', marker_key: 'hba1c', entry_date: '2026-09-12' }),
        result({
          id: 'r2',
          marker_key: null,
          custom_marker_id: 'm1',
          entry_date: '2026-10-01',
          unit: 'mg/dL',
          value_numeric: 80,
        }),
      ],
      labels
    );

    expect(markers.map((m) => m.id)).toEqual([
      'custom:m1', // newest result
      'builtin:hba1c',
      'custom:m2', // no results yet
    ]);
  });

  it('names built-in markers from the localized labels and custom ones as typed', () => {
    const [builtin, customRow] = buildLabMarkers(
      [custom({ id: 'm1', name: 'My marker' })],
      [result({ marker_key: 'hba1c', entry_date: '2026-10-01' })],
      labels
    );
    expect(builtin?.name).toBe('Glukoza HbA1c');
    expect(customRow?.name).toBe('My marker');
  });

  it('falls back to the English preset name without a label', () => {
    const [builtin] = buildLabMarkers([], [result({ marker_key: 'hba1c' })]);
    expect(builtin?.name).toBe('HbA1c');
  });

  it('takes the unit from the latest result and the range from the preset', () => {
    const [builtin] = buildLabMarkers(
      [],
      [result({ marker_key: 'hba1c', unit: 'mmol/mol' })]
    );
    expect(builtin?.unit).toBe('mmol/mol');
    expect(builtin?.ref_range_low).toBe(4);
    expect(builtin?.ref_range_high).toBe(5.6);
  });

  it('uses the sex-specific preset range when the sex is known', () => {
    const [male] = buildLabMarkers(
      [],
      [result({ marker_key: 'hemoglobin', unit: 'g/dL' })],
      {},
      'male'
    );
    const [female] = buildLabMarkers(
      [],
      [result({ marker_key: 'hemoglobin', unit: 'g/dL' })],
      {},
      'female'
    );
    expect(male?.ref_range_low).toBe(13.5);
    expect(female?.ref_range_low).toBe(12);
  });

  it('ignores a result for a key this build does not know', () => {
    expect(
      buildLabMarkers([], [result({ marker_key: 'not_a_marker' })])
    ).toEqual([]);
  });
});

describe('buildLabPickerOptions', () => {
  const markers = buildLabMarkers([custom({ id: 'm1', name: 'ApoB' })], [], {});

  it('lists the user markers first, then the presets', () => {
    const options = buildLabPickerOptions(markers, '');
    expect(options[0]).toMatchObject({ kind: 'custom' });
    expect(options.slice(1).every((o) => o.kind === 'preset')).toBe(true);
  });

  it('searches the localized name, the English name and aliases', () => {
    const labels = { hba1c: 'Glukoza HbA1c wynik' };
    const names = (query: string) =>
      buildLabPickerOptions(markers, query, labels)
        .filter((o) => o.kind === 'preset')
        .map((o) => (o.kind === 'preset' ? o.preset.key : ''));
    expect(names('wynik')).toContain('hba1c');
    expect(names('hemoglobin a1c')).toContain('hba1c');
    expect(names('a1c')).toContain('hba1c');
    expect(names('definitely not a marker')).toEqual([]);
  });

  it('sorts presets by their localized name', () => {
    const labels = { hba1c: 'AAA first', ldl: 'ZZZ last' };
    const keys = buildLabPickerOptions([], '', labels).map((o) =>
      o.kind === 'preset' ? o.preset.key : ''
    );
    expect(keys[0]).toBe('hba1c');
    expect(keys[keys.length - 1]).toBe('ldl');
  });
});

describe('labPresetName', () => {
  it('prefers the label and falls back to the English name', () => {
    const preset = buildLabPickerOptions([], 'hba1c').find(
      (o) => o.kind === 'preset'
    );
    if (preset?.kind !== 'preset') throw new Error('preset missing');
    expect(labPresetName(preset.preset, { hba1c: 'Etykieta' })).toBe(
      'Etykieta'
    );
    expect(labPresetName(preset.preset, {})).toBe('HbA1c');
  });
});

describe('sex-aware presets', () => {
  const hemoglobin = () => {
    const found = buildLabPickerOptions([], 'hemoglobin').find(
      (o) => o.kind === 'preset' && o.preset.key === 'hemoglobin'
    );
    if (found?.kind !== 'preset') throw new Error('preset missing');
    return found.preset;
  };

  it('uses the profile sex for the prefilled range', () => {
    expect(labPresetDefaults(hemoglobin(), 'male').ref_range_low).toBe(13.5);
    expect(labPresetDefaults(hemoglobin(), 'female').ref_range_low).toBe(12);
  });

  it('falls back to the neutral default with no known sex', () => {
    expect(labPresetDefaults(hemoglobin(), null)).toMatchObject({
      ref_range_low: 12,
      ref_range_high: 17.5,
    });
  });

  it('only recognises male and female profile genders', () => {
    expect(labSexFromGender('male')).toBe('male');
    expect(labSexFromGender('female')).toBe('female');
    expect(labSexFromGender('other')).toBeNull();
    expect(labSexFromGender(undefined)).toBeNull();
  });
});
