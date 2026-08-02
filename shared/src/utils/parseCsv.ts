// Single CSV-parsing entry point shared by every import screen (frontend)
// and the server-side exercise CSV import route. Wraps PapaParse with:
//
//   - header trimming (papaparse's transformHeader doesn't run by default;
//     this was already true in FoodImportFromCSV.tsx but missing from the
//     health/exercise importers, causing silent header-mismatch failures on
//     files with trailing whitespace in a header cell).
//   - a resolved delimiter/quote character driven by CsvFormatOptions
//     instead of always trusting Papa's auto-detect.
//   - PapaParse's own parse errors (including 'UndetectableDelimiter')
//     surfaced as structured `warnings`, instead of being console.warn'd or
//     silently dropped — every existing importer did one of those two
//     things, which is why a semicolon file failing to parse produced no
//     visible signal to the user.
//
// This module intentionally does NOT do number/date coercion — that's
// csvValue.ts's job, driven by the `resolvedDecimal` this returns. Keeping
// them separate means server code that only needs row/header splitting
// (no numeric semantics) can use this without pulling in coercion logic.

import Papa from "papaparse";
import {
  detectDecimalFormat,
  resolveDecimalFormat,
  type CsvDelimiter,
  type CsvFormatOptions,
  type CsvParseWarning,
} from "./csvFormat.ts";
import type { DecimalFormat } from "./csvValue.ts";

export interface CsvParseResult<
  T extends Record<string, string> = Record<string, string>,
> {
  rows: T[];
  headers: string[];
  /** What Papa actually used, whether from `options.delimiter` or its own guess. */
  detectedDelimiter: CsvDelimiter | null;
  /** True when Papa could not confidently guess a delimiter (only relevant when options.delimiter === 'auto'). */
  delimiterDetectionFailed: boolean;
  decimal: ReturnType<typeof detectDecimalFormat>;
  resolvedDecimal: DecimalFormat;
  warnings: CsvParseWarning[];
  /** Set when the file could not be usefully parsed at all (e.g. zero rows). */
  fatal?: CsvParseWarning;
}

export interface ParseCsvOptions {
  /** Column names to scan for decimal-format evidence. Omit to skip detection (defaults to 'us'). */
  numericColumns?: string[];
  /** Cap on rows Papa parses — pass a small number for a live preview. */
  preview?: number;
  /** Sample size for decimal detection; defaults to 200 rows, independent of `preview`. */
  decimalSampleSize?: number;
}

const trimHeader = (h: string): string => h.trim();

/**
 * Full parse: rows, headers, delimiter/decimal detection, and structured
 * warnings. This is what every import screen and the server route should
 * call instead of `Papa.parse` directly.
 */
export function parseCsv<
  T extends Record<string, string> = Record<string, string>,
>(
  text: string,
  options: CsvFormatOptions,
  opts: ParseCsvOptions = {},
): CsvParseResult<T> {
  const papaConfig: Papa.ParseConfig<T> = {
    header: true,
    skipEmptyLines: true,
    transformHeader: trimHeader,
    quoteChar: options.quoteChar,
  };
  if (options.delimiter !== "auto") {
    papaConfig.delimiter = options.delimiter;
  }
  if (opts.preview) {
    papaConfig.preview = opts.preview;
  }

  const { data, errors, meta } = Papa.parse<T>(text, papaConfig);

  const warnings: CsvParseWarning[] = errors.map((e) => ({
    code: e.code,
    message: e.message,
    row: e.row,
  }));

  const delimiterDetectionFailed =
    options.delimiter === "auto" &&
    errors.some((e) => e.code === "UndetectableDelimiter");

  const headers = meta.fields ?? [];

  const decimal = opts.numericColumns
    ? detectDecimalFormat(data, opts.numericColumns, opts.decimalSampleSize)
    : { format: "us" as const, confident: false };
  const resolvedDecimal = resolveDecimalFormat(options.decimal, decimal);

  const fatal: CsvParseWarning | undefined =
    data.length === 0
      ? { code: "EmptyFile", message: "No data rows were found in this file." }
      : undefined;

  return {
    rows: data,
    headers,
    detectedDelimiter: (meta.delimiter as CsvDelimiter) || null,
    delimiterDetectionFailed,
    decimal,
    resolvedDecimal,
    warnings,
    fatal,
  };
}

/**
 * Header row only — used by importers that need to validate/map columns
 * before committing to a full parse (e.g. the header-mapping dialogs in
 * Health and Exercise DB import).
 */
export function parseCsvHeaders(
  text: string,
  options: CsvFormatOptions,
): {
  headers: string[];
  detectedDelimiter: CsvDelimiter | null;
  delimiterDetectionFailed: boolean;
} {
  const result = parseCsv(text, options, { preview: 1 });
  return {
    headers: result.headers,
    detectedDelimiter: result.detectedDelimiter,
    delimiterDetectionFailed: result.delimiterDetectionFailed,
  };
}

/** Shared upper bound on file size for text-based import (was Health-only; now applies to all). */
export const MAX_CSV_FILE_SIZE_BYTES = 25 * 1024 * 1024;
