import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../models/chatRepository.js', () => ({
  default: {
    getActiveAiServiceSetting: vi.fn(),
    getActiveVisionAiServiceSetting: vi.fn(),
    getAiServiceSettingForBackend: vi.fn(),
  },
}));
vi.mock('../ai/providerDispatch.js', () => ({ dispatchAiRequest: vi.fn() }));
vi.mock('../utils/outboundUrlPolicy.js', () => ({
  resolveAiNetworkPolicy: vi.fn(async () => ({})),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
const destroy = vi.fn(async () => undefined);
vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(async () => ({
    numPages: 2,
    loadingTask: { destroy },
  })),
  extractText: vi.fn(),
}));

import { extractText, getDocumentProxy } from 'unpdf';
import chatRepository from '../models/chatRepository.js';
import { dispatchAiRequest } from '../ai/providerDispatch.js';
import {
  MAX_PDF_PAGES,
  extractLabReport,
  matchLabReportResults,
  normalizeLabReport,
} from '../services/labReportScanService.js';

const REPORT_TEXT =
  'Quest Diagnostics. Collected 2026-09-20. Hemoglobin A1c 5.4 % (4.0 - 5.6). LDL Cholesterol 130 mg/dL (<100).';

describe('normalizeLabReport number text', () => {
  const read = (value: unknown) =>
    normalizeLabReport({ results: [{ name: 'X', value }] })?.results[0]?.value;

  it('reads a single comma as a decimal separator', () => {
    expect(read('5,4')).toBe(5.4);
    expect(read('12,34')).toBe(12.34);
    expect(read('0,0075')).toBe(0.0075);
    expect(read(',5')).toBe(0.5);
    expect(read('1234,567')).toBe(1234.567);
  });

  it('reads a zero whole part with three decimals as a decimal, not thousands', () => {
    expect(read('0,007')).toBe(0.007);
    expect(read('0,500')).toBe(0.5);
    expect(read(',007')).toBe(0.007);
    expect(read('00,125')).toBe(0.125);
  });

  it('reads a comma before exactly three digits as a thousands separator', () => {
    expect(read('1,130')).toBe(1130);
    expect(read('250,000')).toBe(250000);
    expect(read('1,234,567')).toBe(1234567);
  });

  it('reads the last of a comma and a dot as the decimal separator', () => {
    expect(read('1.234,5')).toBe(1234.5);
    expect(read('1,234.5')).toBe(1234.5);
  });

  it('still reads plain and spaced numbers, and rejects blanks and junk', () => {
    expect(read('5.4')).toBe(5.4);
    expect(read('1 130')).toBe(1130);
    // A line whose value cannot be read is left out rather than guessed.
    expect(read('  ')).toBeUndefined();
    expect(read('abc')).toBeUndefined();
    expect(read('-2')).toBeUndefined();
    expect(read(5.4)).toBe(5.4);
  });

  it('reads the reference range with the same rule', () => {
    const report = normalizeLabReport({
      results: [{ name: 'X', value: 5, ref_low: '4,0', ref_high: '5,6' }],
    });
    expect(report?.results[0]).toMatchObject({ ref_low: 4, ref_high: 5.6 });
  });
});

describe('normalizeLabReport', () => {
  it('reads loose values and drops lines without a name or a number', () => {
    const report = normalizeLabReport({
      lab_name: ' Quest ',
      collected_on: '2026-09-20',
      results: [
        {
          name: 'Hemoglobin A1c',
          value: '5.4',
          unit: '%',
          ref_low: '4.0',
          ref_high: 5.6,
        },
        { name: 'LDL', value: '1,130', unit: 'mg/dL', ref_high: 100 },
        { name: 'Glucose', value: 'Negative', unit: null },
        { value: 3 },
        { name: 'Blank', value: '   ' },
      ],
    });

    expect(report).toEqual({
      lab_name: 'Quest',
      collected_on: '2026-09-20',
      results: [
        {
          name: 'Hemoglobin A1c',
          value: 5.4,
          unit: '%',
          ref_low: 4,
          ref_high: 5.6,
        },
        {
          name: 'LDL',
          value: 1130,
          unit: 'mg/dL',
          ref_low: null,
          ref_high: 100,
        },
      ],
    });
  });

  it('discards a reversed range and an invalid date', () => {
    const report = normalizeLabReport({
      collected_on: '20/09/2026',
      results: [
        { name: 'HDL', value: 55, unit: 'mg/dL', ref_low: 60, ref_high: 40 },
      ],
    });
    expect(report?.collected_on).toBeNull();
    expect(report?.results[0]).toMatchObject({ ref_low: null, ref_high: null });
  });

  it('is null when nothing usable was read', () => {
    expect(normalizeLabReport(null)).toBeNull();
    expect(normalizeLabReport({ results: [] })).toBeNull();
  });
});

describe('matchLabReportResults', () => {
  it('attaches the preset key for known names and null otherwise', () => {
    const matched = matchLabReportResults({
      lab_name: null,
      collected_on: null,
      results: [
        {
          name: 'Hemoglobin A1c',
          value: 5.4,
          unit: '%',
          ref_low: null,
          ref_high: null,
        },
        {
          name: 'Mystery Test',
          value: 1,
          unit: null,
          ref_low: null,
          ref_high: null,
        },
      ],
    });
    expect(matched.map((r) => r.marker_key)).toEqual(['hba1c', null]);
  });
});

describe('extractLabReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(chatRepository.getActiveAiServiceSetting).mockResolvedValue({
      id: 'text-1',
    } as never);
    vi.mocked(chatRepository.getActiveVisionAiServiceSetting).mockResolvedValue(
      {
        id: 'vision-1',
      } as never
    );
    vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue({
      service_type: 'openai',
      api_key: 'k',
    } as never);
    vi.mocked(dispatchAiRequest).mockResolvedValue({
      ok: true,
      json: {
        results: [{ name: 'HbA1c', value: 5.4, unit: '%' }],
      },
    } as never);
  });

  it('sends a photo to the vision provider as an image', async () => {
    const result = await extractLabReport('abc', 'image/jpeg', 'u1');

    expect(result).toMatchObject({ success: true });
    expect(chatRepository.getActiveVisionAiServiceSetting).toHaveBeenCalled();
    expect(vi.mocked(dispatchAiRequest).mock.calls[0][0].images).toEqual([
      { base64: 'abc', mimeType: 'image/jpeg' },
    ]);
  });

  it('reads a PDF text layer and sends it as text, with no image', async () => {
    vi.mocked(extractText).mockResolvedValue({
      totalPages: 1,
      text: REPORT_TEXT,
    } as never);

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(result).toMatchObject({ success: true });
    expect(chatRepository.getActiveAiServiceSetting).toHaveBeenCalled();
    expect(
      chatRepository.getActiveVisionAiServiceSetting
    ).not.toHaveBeenCalled();
    const request = vi.mocked(dispatchAiRequest).mock.calls[0][0];
    expect(request.images).toBeUndefined();
    expect(request.prompt).toContain('Hemoglobin A1c 5.4 %');
  });

  it('rejects a scanned PDF with no text layer', async () => {
    vi.mocked(extractText).mockResolvedValue({
      totalPages: 2,
      text: '  ',
    } as never);

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'unreadable_pdf',
    });
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('rejects a PDF that cannot be opened', async () => {
    vi.mocked(getDocumentProxy).mockRejectedValueOnce(new Error('bad pdf'));

    const result = await extractLabReport('xxxx', 'application/pdf', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'unreadable_pdf',
    });
  });

  it('rejects an oversized PDF before reading it', async () => {
    const result = await extractLabReport(
      'a'.repeat(20_000_001),
      'application/pdf',
      'u1'
    );

    expect(result).toMatchObject({
      success: false,
      category: 'document_too_large',
    });
    expect(getDocumentProxy).not.toHaveBeenCalled();
  });

  it('refuses a PDF whose text is too long for one prompt instead of cutting it off', async () => {
    vi.mocked(extractText).mockResolvedValue({
      totalPages: 2,
      text: 'HbA1c 5.4 % '.repeat(6_000),
    } as never);

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'document_too_large',
    });
    expect(dispatchAiRequest).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('sends the whole text of a PDF that fits', async () => {
    const text = 'HbA1c 5.4 % '.repeat(100);
    vi.mocked(extractText).mockResolvedValue({ totalPages: 1, text } as never);

    await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    const request = vi.mocked(dispatchAiRequest).mock.calls[0][0];
    expect(request.prompt).toContain(text.trim());
  });

  it('refuses a PDF with too many pages before reading any of them', async () => {
    vi.mocked(getDocumentProxy).mockResolvedValueOnce({
      numPages: 20_000,
      loadingTask: { destroy },
    } as never);

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'document_too_large',
    });
    expect(extractText).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('reads a PDF at the page limit', async () => {
    vi.mocked(getDocumentProxy).mockResolvedValueOnce({
      numPages: MAX_PDF_PAGES,
      loadingTask: { destroy },
    } as never);
    vi.mocked(extractText).mockResolvedValue({
      totalPages: MAX_PDF_PAGES,
      text: 'HbA1c 5.4 % '.repeat(20),
    } as never);

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(extractText).toHaveBeenCalled();
    expect(result).not.toMatchObject({ category: 'document_too_large' });
  });

  it('opens a PDF with a cap on decoded image size and always releases it', async () => {
    vi.mocked(extractText).mockRejectedValueOnce(new Error('boom'));

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(result).toMatchObject({ category: 'unreadable_pdf' });
    expect(vi.mocked(getDocumentProxy).mock.calls[0][1]).toMatchObject({
      maxImageSize: expect.any(Number),
    });
    expect(destroy).toHaveBeenCalled();
  });

  it('reports no AI configured', async () => {
    vi.mocked(chatRepository.getActiveVisionAiServiceSetting).mockResolvedValue(
      null as never
    );
    const result = await extractLabReport('abc', 'image/png', 'u1');
    expect(result).toMatchObject({
      success: false,
      category: 'no_ai_configured',
    });
  });

  it('turns an unreadable answer into a parse error', async () => {
    vi.mocked(dispatchAiRequest).mockResolvedValue({
      ok: true,
      json: { results: [] },
    } as never);
    const result = await extractLabReport('abc', 'image/jpeg', 'u1');
    expect(result).toMatchObject({ success: false, category: 'parse_error' });
  });
});
