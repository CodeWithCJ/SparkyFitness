import Papa from 'papaparse';
import {
  ImportCategory,
  getCategoryConfig,
} from '@/constants/healthDataImport';

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
export interface ImportError {
  error: string;
  entry: Record<string, string>;
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

const isBlank = (value: string | undefined): boolean =>
  value === undefined || value === null || String(value).trim() === '';

const toNumber = (value: string | undefined): number | undefined => {
  if (isBlank(value)) return undefined;
  const parsed = Number(String(value).trim());
  return Number.isNaN(parsed) ? undefined : parsed;
};

// ── Unit conversions to the server's stored metric units ────────────────────
// Each converter returns undefined for an unrecognized unit so callers can flag
// the row as an error instead of silently defaulting to the base unit.
const KG_UNITS = new Set(['kg', 'kgs', 'kilogram', 'kilograms']);
const LB_UNITS = new Set(['lb', 'lbs', 'pound', 'pounds']);
const CM_UNITS = new Set([
  'cm',
  'centimeter',
  'centimeters',
  'centimetre',
  'centimetres',
]);
const IN_UNITS = new Set(['in', 'inch', 'inches']);
const M_UNITS = new Set(['m', 'meter', 'meters', 'metre', 'metres']);
const ML_UNITS = new Set(['ml', 'milliliter', 'milliliters']);
const L_UNITS = new Set(['l', 'liter', 'liters', 'litre', 'litres']);
const OZ_UNITS = new Set(['oz', 'floz', 'fl oz', 'ounce', 'ounces']);

const norm = (unit?: string): string => (unit || '').trim().toLowerCase();

export const weightToKg = (
  value: number,
  unit?: string
): number | undefined => {
  const u = norm(unit);
  if (u === '' || KG_UNITS.has(u)) return value;
  if (LB_UNITS.has(u)) return value * 0.45359237;
  return undefined;
};

export const lengthToCm = (
  value: number,
  unit?: string
): number | undefined => {
  const u = norm(unit);
  if (u === '' || CM_UNITS.has(u)) return value;
  if (IN_UNITS.has(u)) return value * 2.54;
  if (M_UNITS.has(u)) return value * 100;
  return undefined;
};

export const volumeToMl = (
  value: number,
  unit?: string
): number | undefined => {
  const u = norm(unit);
  if (u === '' || ML_UNITS.has(u)) return value;
  if (L_UNITS.has(u)) return value * 1000;
  if (OZ_UNITS.has(u)) return value * 29.5735;
  return undefined;
};

const round = (value: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

// Parse a CSV string into editable row objects (string cells + a temp id).
// An optional header mapping (required-header -> file-header) supports files
// whose columns don't match the template order, mirroring the exercise importer.
export const parseHealthCSV = (
  text: string,
  category: ImportCategory,
  mapping?: Record<string, string>
): HealthImportRow[] => {
  const config = getCategoryConfig(category);
  const { data, errors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length) console.warn('PapaParse Errors:', errors);

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

// Fan a single measurements row (one row per day, many columns) out into one
// item per populated metric. Blank columns are omitted, never sent as 0. An
// unrecognized weight/length unit fails the whole row rather than defaulting.
const mapMeasurementRow = (row: HealthImportRow): MappedRows => {
  const items: HealthDataItem[] = [];
  const base = baseFields(row);
  const weightUnit = cell(row, 'weight_unit');
  const lengthUnit = cell(row, 'length_unit');

  const weight = toNumber(cell(row, 'weight'));
  if (weight !== undefined) {
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

  const bodyFat = toNumber(cell(row, 'body_fat'));
  if (bodyFat !== undefined) {
    items.push({ ...base, type: 'body_fat', value: bodyFat, unit: '%' });
  }

  const lengthMetrics: Array<
    ['height' | 'neck' | 'waist' | 'hips', number | undefined]
  > = [
    ['height', toNumber(cell(row, 'height'))],
    ['neck', toNumber(cell(row, 'neck'))],
    ['waist', toNumber(cell(row, 'waist'))],
    ['hips', toNumber(cell(row, 'hips'))],
  ];
  for (const [type, value] of lengthMetrics) {
    if (value === undefined) continue;
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

const SLEEP_NUMERIC_FIELDS = [
  'duration_in_seconds',
  'time_asleep_in_seconds',
  'deep_sleep_seconds',
  'light_sleep_seconds',
  'rem_sleep_seconds',
  'awake_sleep_seconds',
  'sleep_score',
];

const mapSleepRow = (row: HealthImportRow): MappedRows => {
  const item: HealthDataItem = { ...baseFields(row), type: 'SleepSession' };
  const bedtime = cell(row, 'bedtime');
  const wakeTime = cell(row, 'wake_time');
  if (!isBlank(bedtime)) item['bedtime'] = bedtime.trim();
  if (!isBlank(wakeTime)) item['wake_time'] = wakeTime.trim();
  for (const field of SLEEP_NUMERIC_FIELDS) {
    const num = toNumber(cell(row, field));
    if (num !== undefined) item[field] = num;
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

const mapVitalRow = (row: HealthImportRow): MappedRows => {
  const value = toNumber(cell(row, 'value'));
  const type = cell(row, 'type');
  const unit = cell(row, 'unit');
  if (isBlank(type) || value === undefined) return { items: [], errors: [] };
  const item: HealthDataItem = { ...baseFields(row), type: type.trim(), value };
  if (!isBlank(unit)) item.unit = unit.trim();
  return { items: [item], errors: [] };
};

const mapActivityRow = (row: HealthImportRow): MappedRows => {
  const value = toNumber(cell(row, 'value'));
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

const mapHydrationRow = (row: HealthImportRow): MappedRows => {
  const value = toNumber(cell(row, 'value'));
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

const mapMoodRow = (row: HealthImportRow): MappedRows => {
  const moodValueRaw = cell(row, 'mood_value');
  if (isBlank(moodValueRaw)) return { items: [], errors: [] };
  const moodValue = toNumber(moodValueRaw);
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
  rows: HealthImportRow[]
): MappedRows => {
  const mapper: Record<ImportCategory, (row: HealthImportRow) => MappedRows> = {
    measurements: mapMeasurementRow,
    sleep: mapSleepRow,
    vitals: mapVitalRow,
    activity: mapActivityRow,
    hydration: mapHydrationRow,
    mood: mapMoodRow,
  };
  const items: HealthDataItem[] = [];
  const errors: ImportError[] = [];
  for (const row of rows) {
    const mapped = mapper[category](row);
    items.push(...mapped.items);
    errors.push(...mapped.errors);
  }
  return { items, errors };
};
