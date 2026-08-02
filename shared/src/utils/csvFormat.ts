// Format-selection types and detection for the unified CSV import UI. This
// module owns the "what does the user get to choose, and what can we
// reliably guess" boundary; the actual cell-level coercion stays in
// csvValue.ts (toNumber/readNumberCell already accept the DecimalFormat this
// module resolves — see resolveDecimalFormat).
//
// Background: DecimalFormat ('us' | 'eu') existed in csvValue.ts from the
// #1960 fix, but no caller ever surfaced it to the user — every import
// silently assumed 'us'. This module is what finally makes that choice
// visible, auto-detected, and overridable, plus adds the delimiter and
// quote-character axes Papa was already guessing at without telling anyone.

import { isBlank, type DecimalFormat } from "./csvValue.ts";

/** Delimiters PapaParse itself guesses between; see papaparse's guessDelimiter. */
export type CsvDelimiter = "," | ";" | "\t" | "|";

export type CsvQuoteChar = '"' | "'";

/** A user-facing choice for a genuinely ambiguous axis: their pick, or 'auto'. */
export type DecimalFormatChoice = DecimalFormat | "auto";
export type CsvDelimiterChoice = CsvDelimiter | "auto";

/** Supported date formats for CSV importers. */
export const DATE_FORMATS: string[] = [
  "MM/dd/yyyy",
  "dd/MM/yyyy",
  "dd-MMM-yyyy",
  "yyyy-MM-dd",
  "MMM dd, yyyy",
  "yyyy/MM/dd",
  "dd.MM.yyyy",
];

/** The full set of format knobs an import screen may expose. */
export interface CsvFormatOptions {
  delimiter: CsvDelimiterChoice;
  decimal: DecimalFormatChoice;
  quoteChar: CsvQuoteChar;
  /** date-fns pattern, e.g. 'MM/dd/yyyy'. Undefined when the importer has no date column. */
  dateFormat?: string;
}

/**
 * Which axes an importer should render. This is the mechanism behind the
 * "don't show a control for something that doesn't apply" rule — e.g. Food
 * Database has no date column, so it passes `date: false` and the format
 * bar renders no date control at all (not a disabled one).
 */
export interface CsvFormatCapabilities {
  delimiter: boolean;
  decimal: boolean;
  quote: boolean;
  date: boolean;
}

export const DEFAULT_CSV_FORMAT: CsvFormatOptions = {
  delimiter: "auto",
  decimal: "auto",
  quoteChar: '"',
};

export const CSV_DELIMITER_LABEL_KEYS: Record<CsvDelimiter, string> = {
  ",": "comma",
  ";": "semicolon",
  "\t": "tab",
  "|": "pipe",
};

/**
 * Result of scanning a file's numeric columns for decimal-format evidence.
 *
 * `confident: false` means no cell in the sample disambiguated the format —
 * either every numeric cell was unambiguous ("both separators present" or
 * "no separator at all"), or there simply were none. In that case `format`
 * is a default, not a detection, and callers should say so rather than
 * imply certainty.
 */
export interface DecimalDetection {
  format: DecimalFormat;
  confident: boolean;
  /** The raw cell text that decided it, for showing "detected from '80,2'". */
  evidence?: string;
}

const US_DECIMAL_EVIDENCE = /^-?\d+\.\d{1,2}$|^-?\d+\.\d{4,}$/;
const EU_DECIMAL_EVIDENCE = /^-?\d+,\d{1,2}$|^-?\d+,\d{4,}$/;
const HAS_DOT = /\./;
const HAS_COMMA = /,/;

/**
 * Scans up to `sampleSize` rows across `numericColumns` for cells whose
 * shape unambiguously indicates US or EU decimal convention, and returns a
 * majority verdict.
 *
 * Deliberately narrow: this only ever decides the one case toNumber() can't
 * decide on its own (a lone separator with an ambiguous 3-digit trailing
 * group, e.g. "1,234"). Cells with both '.' and ',' are locale-agnostic
 * (toNumber resolves them from separator order) and contribute no vote.
 * Cells that are themselves ambiguous (the "1,234" shape) also don't vote —
 * they're the thing being decided, not evidence for deciding it.
 *
 * `sampleSize` defaults to unlimited (scan every row): a majority verdict
 * can be swung by a single clarifying row anywhere in the file (a 1000-row
 * export that's ambiguous everywhere except row 999), and this check is a
 * plain regex test per cell — cheap even across a very large file, unlike a
 * full re-parse. Only pass a smaller `sampleSize` where a caller has
 * already deliberately truncated the parse (e.g. a fast interactive
 * preview) and wants detection to match that truncation.
 */
export function detectDecimalFormat(
  rows: Array<Record<string, string>>,
  numericColumns: string[],
  sampleSize: number = Number.POSITIVE_INFINITY,
): DecimalDetection {
  let usVotes = 0;
  let euVotes = 0;
  let usEvidence: string | undefined;
  let euEvidence: string | undefined;

  const sample = rows.slice(0, sampleSize);
  for (const row of sample) {
    for (const col of numericColumns) {
      const raw = row[col];
      if (isBlank(raw)) continue;
      const text = String(raw).trim();

      // Both separators present: locale-agnostic (last one wins), no vote.
      if (HAS_DOT.test(text) && HAS_COMMA.test(text)) continue;

      if (EU_DECIMAL_EVIDENCE.test(text)) {
        euVotes++;
        euEvidence ??= text;
      } else if (US_DECIMAL_EVIDENCE.test(text)) {
        usVotes++;
        usEvidence ??= text;
      }
      // Anything else (no separator, or the ambiguous 3-digit-tail shape) casts no vote.
    }
  }

  if (euVotes === 0 && usVotes === 0) {
    return { format: "us", confident: false };
  }
  if (euVotes > usVotes) {
    return { format: "eu", confident: true, evidence: euEvidence };
  }
  return { format: "us", confident: true, evidence: usEvidence };
}

/** 'auto' resolves to the detection; an explicit choice always wins. */
export function resolveDecimalFormat(
  choice: DecimalFormatChoice,
  detection: DecimalDetection,
): DecimalFormat {
  return choice === "auto" ? detection.format : choice;
}

// ── Error/outcome reporting shared across all importers ────────────────────
// Shaped to match the existing HealthDataImportResult and FoodDiaryImportResult
// response types structurally, so those two importers can adopt the shared
// result panel with a pure render swap, no adapter layer.

export interface CsvImportIssue {
  error: string;
  entry?: unknown;
  row?: number;
}

export interface CsvParseWarning {
  code: string;
  message: string;
  row?: number;
}

export interface CsvImportOutcome<T = unknown> {
  processed: T[];
  // Only ever displayed as a count in the shared result panel, so shapes
  // vary by importer (Health: {reason,entry}[]; Food Diary: unknown[]) —
  // kept loose rather than forcing every caller into one shape.
  skipped: unknown[];
  errors: CsvImportIssue[];
  parseWarnings?: CsvParseWarning[];
}

// ── Header-mapping suggestion, shared by every importer's mapping dialog ───

const normalizeHeader = (h: string): string => h.toLowerCase().replace(/[_ ]/g, "");

/**
 * Best-effort initial guess at which file column corresponds to each
 * required header, for pre-filling a header-mapping dialog. Matches by
 * normalized name (case/underscore/space-insensitive) only — never guesses
 * from position or content, so an unmatched required header is left
 * unmapped rather than silently bound to the wrong column.
 */
export function suggestHeaderMapping(
  requiredHeaders: string[],
  fileHeaders: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const required of requiredHeaders) {
    const normalizedRequired = normalizeHeader(required);
    const match = fileHeaders.find(
      (h) => normalizeHeader(h) === normalizedRequired,
    );
    if (match) mapping[required] = match;
  }
  return mapping;
}
