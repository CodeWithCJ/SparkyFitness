import {
  LAB_MARKER_PRESETS,
  labPresetRange,
  type LabMarkerPreset,
  type LabSex,
} from '../constants/labMarkers.ts';
import type { ImportLabReportBody } from '../schemas/api/LabResults.api.zod.ts';
import type { LabReportScanResult } from '../schemas/api/LabReportScan.api.zod.ts';
import {
  labPresetName,
  sameLabUnit,
  type LabMarker,
  type LabMarkerLabels,
} from './labResults.ts';

/** Why a scanned result cannot be imported. */
export type LabImportBlock = 'duplicate';

/** Something to check before saving, which does not stop the import. */
export type LabImportWarning = 'unit_differs';

export interface RangeBounds {
  low: number | null;
  high: number | null;
}

export interface LabImportRow {
  /** Stable key within one scan. */
  key: string;
  result: LabReportScanResult;
  /** Shown as the row title. */
  title: string;
  /** What the result is saved to. */
  target:
    | { kind: 'builtin'; preset: LabMarkerPreset }
    | { kind: 'custom'; name: string; existing: boolean };
  /** The unit saved with the result: the one the report prints, else the marker's. */
  unit: string;
  /** The unit of the marker's earlier results, when it has any. */
  earlierUnit: string | null;
  /** The reference range saved with the result. */
  range: RangeBounds;
  /** The range the report printed, when it printed one. */
  reportRange: RangeBounds | null;
  blocked: LabImportBlock | null;
  warning: LabImportWarning | null;
}

const presetByKey = (key: string | null): LabMarkerPreset | undefined =>
  key ? LAB_MARKER_PRESETS.find((p) => p.key === key) : undefined;

/**
 * Turns scanned results into import rows. Each is matched to a built-in marker
 * (when the server recognised the name), to one of the user's own markers by
 * name, or to a new marker of that name. It keeps the unit and the reference
 * range the report printed; with no printed range it takes the marker's own.
 * A second result for a marker already in the report is blocked, and a unit
 * that differs from the marker's earlier results is flagged, not converted.
 */
export function planLabImport(
  results: LabReportScanResult[],
  markers: LabMarker[],
  labels: LabMarkerLabels,
  sex: LabSex | null
): LabImportRow[] {
  const seen = new Set<string>();

  return results.map((result, index): LabImportRow => {
    const reportRange: RangeBounds | null =
      result.ref_low !== null || result.ref_high !== null
        ? { low: result.ref_low, high: result.ref_high }
        : null;
    const printedUnit = result.unit?.trim() ?? '';

    const preset = presetByKey(result.marker_key);
    const name = result.name.trim();
    const custom = preset
      ? undefined
      : markers.find(
          (m) =>
            m.markerId !== null && m.name.toLowerCase() === name.toLowerCase()
        );

    let title: string;
    let target: LabImportRow['target'];
    let identity: string;
    let earlierUnit: string | null;
    let defaultRange: RangeBounds;
    let defaultRangeUnit: string;
    if (preset) {
      const earlier = markers.find((m) => m.markerKey === preset.key);
      title = labPresetName(preset, labels);
      target = { kind: 'builtin', preset };
      identity = `key:${preset.key}`;
      earlierUnit = earlier?.latest ? earlier.unit : null;
      const range = labPresetRange(preset, sex);
      defaultRange = { low: range.low, high: range.high };
      defaultRangeUnit = preset.unit;
    } else {
      title = custom?.name ?? name;
      target = {
        kind: 'custom',
        name: custom?.name ?? name,
        existing: !!custom,
      };
      identity = `name:${(custom?.name ?? name).toLowerCase()}`;
      earlierUnit = custom?.latest ? custom.unit : null;
      defaultRange = {
        low: custom?.ref_range_low ?? null,
        high: custom?.ref_range_high ?? null,
      };
      defaultRangeUnit = custom?.ref_range_unit ?? '';
    }

    const duplicate = seen.has(identity);
    seen.add(identity);
    const unit = printedUnit || (preset?.unit ?? custom?.unit ?? '');
    // The marker's own range is in the marker's unit, so a result printed in
    // another unit takes none rather than a range that does not fit it.
    const fallbackRange =
      unit !== '' &&
      defaultRangeUnit !== '' &&
      !sameLabUnit(unit, defaultRangeUnit, preset?.key)
        ? { low: null, high: null }
        : defaultRange;

    return {
      key: String(index),
      result,
      title,
      target,
      unit,
      earlierUnit,
      range: reportRange ?? fallbackRange,
      reportRange,
      blocked: duplicate ? 'duplicate' : null,
      warning:
        earlierUnit !== null &&
        unit !== '' &&
        !sameLabUnit(unit, earlierUnit, preset?.key)
          ? 'unit_differs'
          : null,
    };
  });
}

/** The body for saving the included rows as one report. */
export function labImportBody(
  rows: LabImportRow[],
  options: {
    labName: string | null;
    date: string;
    values: Record<string, number>;
    /**
     * Made once per reviewed report and sent with every try to save it, so a
     * retry after a lost answer gets the saved report back, not a second copy.
     */
    clientRequestId?: string;
  }
): ImportLabReportBody {
  return {
    ...(options.clientRequestId
      ? { client_request_id: options.clientRequestId }
      : {}),
    lab_name: options.labName,
    entry_date: options.date,
    results: rows.map((row) => ({
      ...(row.target.kind === 'builtin'
        ? { marker_key: row.target.preset.key }
        : { marker_name: row.target.name }),
      value_numeric: options.values[row.key] ?? row.result.value,
      unit: row.unit,
      ref_range_low: row.range.low,
      ref_range_high: row.range.high,
    })),
  };
}
