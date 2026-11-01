import { describe, expect, it } from 'vitest';
import {
  LAB_MARKER_PRESETS,
  LAB_MARKER_SEX_RANGES,
  hasSexSpecificRange,
  labPresetRange,
  findLabMarkerPreset,
  labRangeStatus,
} from '@workspace/shared';

describe('labRangeStatus', () => {
  it('classifies against a closed range', () => {
    expect(labRangeStatus(5.2, 4, 5.6)).toBe('in_range');
    expect(labRangeStatus(3.9, 4, 5.6)).toBe('low');
    expect(labRangeStatus(6.1, 4, 5.6)).toBe('high');
  });
  it('treats a missing bound as open-ended', () => {
    expect(labRangeStatus(500, null, 200)).toBe('high');
    expect(labRangeStatus(0, null, 200)).toBe('in_range');
    expect(labRangeStatus(35, 40, null)).toBe('low');
  });
  it('is unknown with no range', () => {
    expect(labRangeStatus(1, null, null)).toBe('unknown');
  });
});

describe('findLabMarkerPreset', () => {
  it('matches display names, keys and aliases case-insensitively', () => {
    expect(findLabMarkerPreset('Hemoglobin A1c')?.key).toBe('hba1c');
    expect(findLabMarkerPreset(' LDL-C ')?.key).toBe('ldl');
    expect(findLabMarkerPreset('vitamin_d')?.key).toBe('vitamin_d');
  });
  it('returns undefined for unknown markers', () => {
    expect(findLabMarkerPreset('not a marker')).toBeUndefined();
  });
  it('has unique keys and sane ranges', () => {
    const keys = LAB_MARKER_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of LAB_MARKER_PRESETS) {
      if (p.refRangeLow !== null && p.refRangeHigh !== null) {
        expect(p.refRangeLow).toBeLessThanOrEqual(p.refRangeHigh);
      }
    }
  });
});

describe('LAB_MARKER_PRESETS names', () => {
  it('keeps aliases lowercase and never shared between two markers', () => {
    const seen = new Map<string, string>();
    for (const p of LAB_MARKER_PRESETS) {
      for (const name of [p.key, p.displayName.toLowerCase(), ...p.aliases]) {
        expect(name).toBe(name.toLowerCase());
        const owner = seen.get(name);
        if (owner !== undefined) expect(owner).toBe(p.key);
        seen.set(name, p.key);
      }
    }
  });
  it('resolves every preset by its own display name', () => {
    for (const p of LAB_MARKER_PRESETS) {
      expect(findLabMarkerPreset(p.displayName)?.key).toBe(p.key);
    }
  });
});

describe('sex-specific ranges', () => {
  const preset = (key: string) =>
    LAB_MARKER_PRESETS.find((p) => p.key === key)!;

  it('only covers real presets, with sane bounds', () => {
    for (const [key, bySex] of Object.entries(LAB_MARKER_SEX_RANGES)) {
      expect(LAB_MARKER_PRESETS.some((p) => p.key === key)).toBe(true);
      for (const { low, high } of Object.values(bySex)) {
        if (low !== null && high !== null)
          expect(low).toBeLessThanOrEqual(high);
      }
    }
  });
  it('uses the profile sex when known', () => {
    expect(labPresetRange(preset('hemoglobin'), 'male')).toEqual({
      low: 13.5,
      high: 17.5,
    });
    expect(labPresetRange(preset('hemoglobin'), 'female')).toEqual({
      low: 12.0,
      high: 15.5,
    });
    expect(labPresetRange(preset('hdl'), 'female')).toEqual({
      low: 50,
      high: null,
    });
  });
  it('falls back to the sex-neutral default when sex is unknown', () => {
    expect(labPresetRange(preset('hemoglobin'), null)).toEqual({
      low: 12.0,
      high: 17.5,
    });
    expect(labPresetRange(preset('testosterone'), undefined)).toEqual({
      low: null,
      high: null,
    });
  });
  it('leaves sex-neutral markers alone', () => {
    expect(hasSexSpecificRange(preset('hba1c'))).toBe(false);
    expect(labPresetRange(preset('hba1c'), 'female')).toEqual({
      low: 4,
      high: 5.6,
    });
  });
});
