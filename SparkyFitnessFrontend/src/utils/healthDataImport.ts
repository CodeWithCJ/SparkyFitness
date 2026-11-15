import {
  ImportCategory,
  getCategoryConfig,
} from '@/constants/healthDataImport';
import {
  isBlank,
  toNumber,
  readNumberCell,
  weightToKg,
  lengthToCm,
  volumeToMl,
  round,
  parseCsv,
  detectDecimalFormat,
  resolveDecimalFormat,
  DEFAULT_CSV_FORMAT,
  type CellResult,
  type DecimalFormat,
  type DecimalFormatChoice,
  type CsvFormatOptions,
} from '@workspace/shared';

// The measurement length fields, shared by mapMeasurementRow (conversion) and
// the useHealthDataImport submit gate (unit-required check). One list so the
// two can't drift apart.
export const MEASUREMENT_LENGTH_FIELDS = [
  'height',
  'neck',
  'waist',
  'hips',
] as const;

const SLEEP_NUMERIC_FIELDS = [
  'duration_in_seconds',
  'time_asleep_in_seconds',
  'deep_sleep_seconds',
  'light_sleep_seconds',
  'rem_sleep_seconds',
  'awake_sleep_seconds',
  'sleep_score',
];

// Numeric columns per import category, used only to auto-detect the decimal
// format (comma vs. dot) from the file's own data — see detectDecimalFormat.
export const NUMERIC_COLUMNS_BY_CATEGORY: Record<ImportCategory, string[]> = {
  measurements: ['weight', 'body_fat', 'height', 'neck', 'waist', 'hips'],
  sleep: [...SLEEP_NUMERIC_FIELDS],
  vitals: ['value'],
  activity: ['value'],
  hydration: ['value'],
  mood: ['mood_value'],
};

export interface HealthImportRow {
  id: string;
  [key: string]: string;
}

// Flat HealthDataPayloadItem shape accepted by
// POST /api/measurements/import-health-data.
export interface HealthDataItem {
  type: string;
  value?: number;
  unit?: string;
  date?: string;
  source?: string;
  notes?: string;
  [key: string]: unknown;
}

// Client-side rejection (e.g. an unrecognized unit) surfaced alongside the
// server's per-record errors so the user sees one combined failure list.
// `key`/`params` localize the message: the pure mapper can't call
// useTranslation, so it returns a key (plus an English fallback in `error`)
// and the caller translates it before display.
export interface ImportError {
  error: string;
  entry: Record<string, string>;
  key?: string;
  params?: Record<string, unknown>;
}

export interface MappedRows {
  items: HealthDataItem[];
  errors: ImportError[];
}

export const generateUniqueId = () =>
  `temp_${Math.random().toString(36).slice(2, 11)}`;

// Row cells come from an index signature; read them through a helper so strict
// index-access rules are satisfied and missing columns read as empty strings.
const cell = (row: HealthImportRow, key: string): string => row[key] ?? '';

// isBlank, toNumber, weightToKg/lengthToCm/volumeToMl, and round now live in
// @workspace/shared/utils/csvValue — they are used by every CSV import path,
// not just this one (issue #1960 was fixed here first, then found to affect
// every other importer identically; see that module's doc for the full
// rationale). readNumber below is a thin wrapper adding the row/column
// context this file's error messages need.
const readNumber = (
  row: HealthImportRow,
  key: string,
  format: DecimalFormat
): CellResult<number> => readNumberCell(cell(row, key), format);

const numberError = (
  row: HealthImportRow,
  key: string,
  raw: string
): MappedRows => ({
  items: [],
  errors: [
    {
      error: `Invalid number '${raw.trim()}' in column '${key}'.`,
      entry: rowSnapshot(row),
    },
  ],
});

// Parse a CSV string into editable row objects (string cells + a temp id).
// An optional header mapping (required-header -> file-header) supports files
// whose columns don't match the template order, mirroring the exercise importer.
export const parseHealthCSV = (
  text: string,
  category: ImportCategory,
  mapping?: Record<string, string>,
  options: CsvFormatOptions = DEFAULT_CSV_FORMAT
): HealthImportRow[] => {
  const config = getCategoryConfig(category);
  const { rows: data } = parseCsv(text, options);

  return data.map((rawRow) => {
    const row: HealthImportRow = { id: generateUniqueId() };
    const fields = mapping ? config.requiredHeaders : Object.keys(rawRow);
    fields.forEach((field) => {
      const header = mapping ? mapping[field] : field;
      row[field] = header ? (rawRow[header] ?? '').trim() : '';
    });
    return row;
  });
};

// Only source/notes are ever persisted (source for most tables, notes for
// custom measurements); source_id is not consumed by this import path.
const baseFields = (row: HealthImportRow) => {
  const out: Partial<HealthDataItem> = { date: cell(row, 'date').trim() };
  const source = cell(row, 'source');
  const notes = cell(row, 'notes');
  if (!isBlank(source)) out.source = source.trim();
  if (!isBlank(notes)) out.notes = notes.trim();
  return out;
};

const rowSnapshot = (row: HealthImportRow): Record<string, string> => {
  const { id: _id, ...rest } = row;
  return rest;
};

// A global unit to apply when the file has no unit column for a metric.
// Without it, weightToKg/lengthToCm treat a blank unit as "already in the SI
// unit" (kg/cm), which silently mis-scales imperial values (e.g. 177 lb ->
// 177 kg). The caller supplies this only when the unit column is unmapped.
export interface UnitOverrides {
  weightUnit?: string;
  lengthUnit?: string;
}

// Fan a single measurements row (one row per day, many columns) out into one
// item per populated metric. Blank columns are omitted, never sent as 0. An
// unrecognized weight/length unit fails the whole row rather than defaulting.
// When a unit column is absent, `unitOverrides` supplies it; a populated cell
// always wins over the override.
const mapMeasurementRow = (
  row: HealthImportRow,
  format: DecimalFormat,
  unitOverrides?: UnitOverrides
): MappedRows => {
  const items: HealthDataItem[] = [];
  const base = baseFields(row);
  const weightUnit = cell(row, 'weight_unit') || unitOverrides?.weightUnit;
  const lengthUnit = cell(row, 'length_unit') || unitOverrides?.lengthUnit;

  const weightCell = readNumber(row, 'weight', format);
  if (!weightCell.ok) return numberError(row, 'weight', weightCell.raw);
  const weight = weightCell.value;
  if (weight !== undefined) {
    // A present weight with no unit (and no override) must not be silently
    // treated as kg — that mis-scales imperial values. Require the unit.
    if (isBlank(weightUnit)) {
      return {
        items: [],
        errors: [
          {
            error:
              'Weight is present but no unit is set. Choose a unit (kg or lb) for this import.',
            key: 'healthDataImport.weightUnitMissing',
            entry: rowSnapshot(row),
          },
        ],
      };
    }
    const kg = weightToKg(weight, weightUnit);
    if (kg === undefined) {
      return {
        items: [],
        errors: [
          {
            error: `Unrecognized weight unit '${weightUnit}'. Use one of: kg, lb.`,
            entry: rowSnapshot(row),
          },
        ],
      };
    }
    items.push({ ...base, type: 'weight', value: round(kg, 3), unit: 'kg' });
  }

  const bodyFatCell = readNumber(row, 'body_fat', format);
  if (!bodyFatCell.ok) return numberError(row, 'body_fat', bodyFatCell.raw);
  const bodyFat = bodyFatCell.value;
  if (bodyFat !== undefined) {
    items.push({ ...base, type: 'body_fat', value: bodyFat, unit: '%' });
  }

  for (const type of MEASUREMENT_LENGTH_FIELDS) {
    const read = readNumber(row, type, format);
    if (!read.ok) return numberError(row, type, read.raw);
    const value = read.value;
    if (value === undefined) continue;
    // A present length with no unit (and no override) must not be silently
    // treated as cm — require the unit.
    if (isBlank(lengthUnit)) {
      return {
        items: [],
        errors: [
          {
            error: `'${type}' is present but no unit is set. Choose a unit (cm, in, or m) for this import.`,
            key: 'healthDataImport.lengthUnitMissing',
            params: { type },
            entry: rowSnapshot(row),
          },
        ],
      };
    }
    const cm = lengthToCm(value, lengthUnit);
    if (cm === undefined) {
      return {
        items: [],
        errors: [
          {
            error: `Unrecognized length unit '${lengthUnit}'. Use one of: cm, in, m.`,
            entry: rowSnapshot(row),
          },
        ],
      };
    }
    items.push({ ...base, type, value: round(cm, 2), unit: 'cm' });
  }

  return { items, errors: [] };
};

const mapSleepRow = (
  row: HealthImportRow,
  format: DecimalFormat
): MappedRows => {
  const item: HealthDataItem = { ...baseFields(row), type: 'SleepSession' };
  const bedtime = cell(row, 'bedtime');
  const wakeTime = cell(row, 'wake_time');
  if (!isBlank(bedtime)) item['bedtime'] = bedtime.trim();
  if (!isBlank(wakeTime)) item['wake_time'] = wakeTime.trim();
  // Optional recording-zone columns: an IANA zone name and/or a UTC offset
  // in minutes. Rows without them display in the profile timezone.
  const recordTimezone = cell(row, 'record_timezone');
  if (!isBlank(recordTimezone)) item['record_timezone'] = recordTimezone.trim();
  const offsetRead = readNumber(row, 'record_utc_offset_minutes', format);
  if (!offsetRead.ok)
    return numberError(row, 'record_utc_offset_minutes', offsetRead.raw);
  if (offsetRead.value !== undefined)
    item['record_utc_offset_minutes'] = offsetRead.value;
  for (const field of SLEEP_NUMERIC_FIELDS) {
    const read = readNumber(row, field, format);
    if (!read.ok) return numberError(row, field, read.raw);
    if (read.value !== undefined) item[field] = read.value;
  }
  // Optional full stage timeline: a JSON array of {stage_type,start_time,end_time}.
  // The server writes these to sleep_entry_stages; durations-only rows omit it.
  const stageRaw = cell(row, 'stage_events');
  if (!isBlank(stageRaw)) {
    try {
      const parsed = JSON.parse(stageRaw);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      item['stage_events'] = parsed;
    } catch {
      return {
        items: [],
        errors: [
          {
            error:
              'Invalid stage_events: must be a JSON array of {stage_type,start_time,end_time}.',
            entry: rowSnapshot(row),
          },
        ],
      };
    }
  }
  return { items: [item], errors: [] };
};

const mapVitalRow = (
  row: HealthImportRow,
  format: DecimalFormat
): MappedRows => {
  const read = readNumber(row, 'value', format);
  if (!read.ok) return numberError(row, 'value', read.raw);
  const value = read.value;
  const type = cell(row, 'type');
  const unit = cell(row, 'unit');
  if (isBlank(type) || value === undefined) return { items: [], errors: [] };
  const item: HealthDataItem = { ...baseFields(row), type: type.trim(), value };
  if (!isBlank(unit)) item.unit = unit.trim();
  return { items: [item], errors: [] };
};

const mapActivityRow = (
  row: HealthImportRow,
  format: DecimalFormat
): MappedRows => {
  const read = readNumber(row, 'value', format);
  if (!read.ok) return numberError(row, 'value', read.raw);
  const value = read.value;
  const rawType = cell(row, 'type');
  if (isBlank(rawType) || value === undefined) return { items: [], errors: [] };
  const type = rawType.trim();
  let outValue = value;
  const rawUnit = cell(row, 'unit');
  let unit = isBlank(rawUnit) ? undefined : rawUnit.trim();
  // Distance falls through to a custom measurement; normalize common units to
  // metres so re-imports are consistent.
  if (type === 'distance' && unit) {
    const u = unit.toLowerCase();
    if (u === 'km') {
      outValue = value * 1000;
      unit = 'm';
    } else if (u === 'mi' || u === 'mile' || u === 'miles') {
      outValue = value * 1609.344;
      unit = 'm';
    }
  }
  const item: HealthDataItem = { ...baseFields(row), type, value: outValue };
  if (unit) item.unit = unit;
  return { items: [item], errors: [] };
};

const mapHydrationRow = (
  row: HealthImportRow,
  format: DecimalFormat
): MappedRows => {
  const read = readNumber(row, 'value', format);
  if (!read.ok) return numberError(row, 'value', read.raw);
  const value = read.value;
  if (value === undefined) return { items: [], errors: [] };
  const unit = cell(row, 'unit');
  const ml = volumeToMl(value, unit);
  if (ml === undefined) {
    return {
      items: [],
      errors: [
        {
          error: `Unrecognized volume unit '${unit}'. Use one of: ml, L, oz.`,
          entry: rowSnapshot(row),
        },
      ],
    };
  }
  return {
    items: [
      { ...baseFields(row), type: 'water', value: Math.round(ml), unit: 'ml' },
    ],
    errors: [],
  };
};

const mapMoodRow = (
  row: HealthImportRow,
  format: DecimalFormat
): MappedRows => {
  const moodValueRaw = cell(row, 'mood_value');
  if (isBlank(moodValueRaw)) return { items: [], errors: [] };
  const moodValue = toNumber(moodValueRaw, format);
  if (
    moodValue === undefined ||
    !Number.isInteger(moodValue) ||
    moodValue < 10 ||
    moodValue > 100
  ) {
    return {
      items: [],
      errors: [
        {
          error: `Invalid mood_value '${moodValueRaw}'. Must be an integer between 10 and 100.`,
          entry: rowSnapshot(row),
        },
      ],
    };
  }
  const item: HealthDataItem = {
    ...baseFields(row),
    type: 'Mood',
    value: moodValue,
  };
  const tagsRaw = cell(row, 'mood_tags');
  if (!isBlank(tagsRaw)) {
    item['mood_tags'] = tagsRaw
      .split('|')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');
  }
  return { items: [item], errors: [] };
};

// Transform editable rows into the flat items POSTed to the server plus any
// client-side rejections (unrecognized units). This is the single place unit
// conversion, numeric coercion, and the wide->tall fan-out for measurements
// happen.
export const mapRowsToHealthItems = (
  category: ImportCategory,
  rows: HealthImportRow[],
  decimalChoice: DecimalFormatChoice = 'auto',
  unitOverrides?: UnitOverrides
): MappedRows => {
  const mapper: Record<
    ImportCategory,
    (
      row: HealthImportRow,
      format: DecimalFormat,
      unitOverrides?: UnitOverrides
    ) => MappedRows
  > = {
    measurements: mapMeasurementRow,
    sleep: mapSleepRow,
    vitals: mapVitalRow,
    activity: mapActivityRow,
    hydration: mapHydrationRow,
    mood: mapMoodRow,
  };
  const detection = detectDecimalFormat(
    rows,
    NUMERIC_COLUMNS_BY_CATEGORY[category]
  );
  const format = resolveDecimalFormat(decimalChoice, detection);
  const items: HealthDataItem[] = [];
  const errors: ImportError[] = [];
  for (const row of rows) {
    const mapped = mapper[category](row, format, unitOverrides);
    items.push(...mapped.items);
    errors.push(...mapped.errors);
  }
  return { items, errors };
};
