import { parseCsv, parseCsvHeaders } from '@workspace/shared';
import { DEFAULT_CSV_FORMAT, type CsvFormatOptions } from '@workspace/shared';

const auto: CsvFormatOptions = DEFAULT_CSV_FORMAT;

describe('parseCsv', () => {
  it('parses a semicolon file on auto-detect', () => {
    const text =
      'date;weight;weight_unit\n2022-06-13;80,2;kg\n2022-06-14;79,7;kg';
    const result = parseCsv(text, auto);
    expect(result.detectedDelimiter).toBe(';');
    expect(result.headers).toEqual(['date', 'weight', 'weight_unit']);
    expect(result.rows).toEqual([
      { date: '2022-06-13', weight: '80,2', weight_unit: 'kg' },
      { date: '2022-06-14', weight: '79,7', weight_unit: 'kg' },
    ]);
    expect(result.delimiterDetectionFailed).toBe(false);
  });

  it('trims header whitespace, matching FoodImportFromCSV behavior', () => {
    const text = ' date ; weight \n2022-06-13;80,2';
    const result = parseCsv(text, auto);
    expect(result.headers).toEqual(['date', 'weight']);
  });

  it('reports UndetectableDelimiter as a structured warning instead of console.warn', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // A single-column file with nothing PapaParse recognizes as any candidate
    // delimiter reliably triggers UndetectableDelimiter.
    const text = 'onlycolumn\nfoo\nbar';
    const result = parseCsv(text, auto);
    expect(result.delimiterDetectionFailed).toBe(true);
    expect(
      result.warnings.some((w) => w.code === 'UndetectableDelimiter')
    ).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("an explicit delimiter overrides Papa's own guess", () => {
    // This file would auto-guess ';' but the caller wants ',' honored anyway
    // (e.g. because the user picked it explicitly after a bad auto-detect).
    const text = 'a,b;c\nfoo,bar;baz';
    const result = parseCsv(text, { ...auto, delimiter: ',' });
    expect(result.headers).toEqual(['a', 'b;c']);
  });

  it('quoteChar drives how embedded delimiters in quoted fields are read', () => {
    const text = `name,note\n'a,b',c`;
    const withSingleQuote = parseCsv(text, { ...auto, quoteChar: "'" });
    // "'" is the quote char, so the embedded comma stays inside the field.
    expect(withSingleQuote.rows[0]).toEqual({ name: 'a,b', note: 'c' });

    const withDoubleQuote = parseCsv(text, { ...auto, quoteChar: '"' });
    // "'" is just a literal character now, so the embedded comma splits the
    // field into an extra column PapaParse can't map to a header — visible
    // proof a wrong quote-char pick mangles the row, which is the intended
    // failure mode (surfaced in the live preview, not hidden).
    expect(withDoubleQuote.rows[0]?.['name']).toBe("'a");
    expect(withDoubleQuote.rows[0]?.['note']).toBe("b'");
  });

  it('runs decimal detection only when numericColumns is supplied', () => {
    // Semicolon-delimited, matching real EU exports (e.g. MacroFactor) —
    // a comma-only single-column file would make Papa's own delimiter
    // auto-detect collide with the decimal separator, which is a test-data
    // pitfall rather than anything real files hit.
    const text = 'date;weight\n2022-06-13;80,2\n2022-06-14;79,7';
    const withDetection = parseCsv(text, auto, { numericColumns: ['weight'] });
    expect(withDetection.decimal.format).toBe('eu');
    expect(withDetection.resolvedDecimal).toBe('eu');

    const withoutDetection = parseCsv(text, auto);
    expect(withoutDetection.decimal).toEqual({
      format: 'us',
      confident: false,
    });
    expect(withoutDetection.resolvedDecimal).toBe('us');
  });

  it('an explicit decimal choice overrides detection', () => {
    const text = 'date;weight\n2022-06-13;80,2';
    const result = parseCsv(
      text,
      { ...auto, decimal: 'us' },
      { numericColumns: ['weight'] }
    );
    // Detection still reports what it saw...
    expect(result.decimal.format).toBe('eu');
    // ...but the resolved value used for actual parsing honors the override.
    expect(result.resolvedDecimal).toBe('us');
  });

  it('flags an empty file as fatal', () => {
    const result = parseCsv('date,weight\n', auto);
    expect(result.fatal?.code).toBe('EmptyFile');
  });
});

describe('parseCsvHeaders', () => {
  it('returns only headers and delimiter info, not full rows', () => {
    const text = 'date;weight\n2022-06-13;80,2\n2022-06-14;79,7';
    const result = parseCsvHeaders(text, auto);
    expect(result.headers).toEqual(['date', 'weight']);
    expect(result.detectedDelimiter).toBe(';');
    expect(result.delimiterDetectionFailed).toBe(false);
  });
});
