import { describe, expect, it, vi, beforeEach } from 'vitest';
import { crc32 } from 'node:zlib';

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
vi.mock('unpdf', () => ({ getDocumentProxy: vi.fn() }));

import { getDocumentProxy } from 'unpdf';
import { log } from '../config/logging.js';
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

/** A PNG header declaring `width` x `height` pixels, a few dozen bytes long. */
function pngDeclaring(width: number, height: number): string {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    // An empty compressed stream: the image data a decoder insists on seeing.
    chunk(
      'IDAT',
      Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])
    ),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

/**
 * A PDF the service can read page by page. `pages[n][c]` is the list of text
 * items in chunk `c` of page `n + 1`. `stats` shows how far reading got, and
 * whether it was cancelled, so a test can tell that reading stopped early.
 */
function givenPdf(pages: string[][][], numPages = pages.length) {
  const stats = { chunksRead: 0, cancelled: 0 };
  const getPage = vi.fn(async (number: number) => ({
    cleanup: vi.fn(),
    streamTextContent: () => {
      const chunks = pages[number - 1] ?? [];
      let next = 0;
      return new ReadableStream({
        pull(controller) {
          if (next >= chunks.length) {
            controller.close();
            return;
          }
          stats.chunksRead += 1;
          controller.enqueue({
            items: chunks[next++].map((str) => ({ str, hasEOL: false })),
          });
        },
        cancel() {
          stats.cancelled += 1;
        },
      });
    },
  }));
  vi.mocked(getDocumentProxy).mockResolvedValueOnce({
    numPages,
    loadingTask: { destroy },
    getPage,
  } as never);
  return { stats, getPage };
}

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
    const photo = pngDeclaring(100, 100);
    const result = await extractLabReport(photo, 'image/jpeg', 'u1');

    expect(result).toMatchObject({ success: true });
    expect(chatRepository.getActiveVisionAiServiceSetting).toHaveBeenCalled();
    expect(vi.mocked(dispatchAiRequest).mock.calls[0][0].images).toEqual([
      { base64: photo, mimeType: 'image/jpeg' },
    ]);
  });

  it('reads a PDF text layer and sends it as text, with no image', async () => {
    givenPdf([[[REPORT_TEXT]]]);

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
    givenPdf([[['  ']], [['  ']]]);

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
    // Under the read budget, over what one prompt takes once normalised.
    givenPdf([[['HbA1c 5.4 % '.repeat(6_000)]]]);

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'document_too_large',
    });
    expect(dispatchAiRequest).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('stops reading and cancels the stream once the text budget is spent', async () => {
    // A thousand chunks of 1,000 characters: a million characters in all.
    const chunks = Array.from({ length: 1000 }, () => ['x'.repeat(1000)]);
    const { stats } = givenPdf([chunks]);

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'document_too_large',
    });
    expect(stats.cancelled).toBeGreaterThan(0);
    expect(stats.chunksRead).toBeLessThan(200);
    expect(dispatchAiRequest).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('sends the whole text of a PDF that fits', async () => {
    const text = 'HbA1c 5.4 % '.repeat(100);
    givenPdf([[[text]]]);

    await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    const request = vi.mocked(dispatchAiRequest).mock.calls[0][0];
    expect(request.prompt).toContain(text.trim());
  });

  it('refuses a PDF with too many pages before reading any of them', async () => {
    const { getPage } = givenPdf([], 20_000);

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'document_too_large',
    });
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('reads a PDF at the page limit', async () => {
    const pages = Array.from({ length: MAX_PDF_PAGES }, () => [
      ['HbA1c 5.4 % '.repeat(20)],
    ]);
    const { getPage } = givenPdf(pages);

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(getPage).toHaveBeenCalledTimes(MAX_PDF_PAGES);
    expect(result).not.toMatchObject({ category: 'document_too_large' });
  });

  it('opens a PDF with a cap on decoded image size and always releases it', async () => {
    const { getPage } = givenPdf([[['x']]]);
    getPage.mockRejectedValueOnce(new Error('boom'));

    const result = await extractLabReport('JVBERi0=', 'application/pdf', 'u1');

    expect(result).toMatchObject({ category: 'unreadable_pdf' });
    expect(vi.mocked(getDocumentProxy).mock.calls[0][1]).toMatchObject({
      maxImageSize: expect.any(Number),
    });
    expect(destroy).toHaveBeenCalled();
  });

  it('refuses a type that is neither a PDF nor a supported photo', async () => {
    for (const type of [
      'image/svg+xml',
      'image/gif',
      'image/heic',
      'image/heif',
      'text/html',
      'x',
    ]) {
      const result = await extractLabReport('abc', type, 'u1');
      expect(result).toMatchObject({
        success: false,
        category: 'unsupported_media',
      });
    }
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('accepts JPEG, PNG and WebP photos, in any case', async () => {
    const photo = pngDeclaring(100, 100);
    for (const type of ['IMAGE/JPEG', ' image/png ', 'image/webp']) {
      const result = await extractLabReport(photo, type, 'u1');
      expect(result).not.toMatchObject({ category: 'unsupported_media' });
    }
  });

  it('refuses HEIC and HEIF, which cannot be size-checked before conversion', async () => {
    const photo = pngDeclaring(100, 100);
    for (const type of ['image/heic', 'image/heif']) {
      const result = await extractLabReport(photo, type, 'u1');
      expect(result).toMatchObject({
        success: false,
        category: 'unsupported_media',
      });
    }
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('refuses a file whose image header cannot be read instead of passing it on', async () => {
    const result = await extractLabReport('abc', 'image/jpeg', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'unsupported_media',
    });
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('refuses an oversized photo before decoding it', async () => {
    const result = await extractLabReport(
      'a'.repeat(8 * 1024 * 1024 + 1),
      'image/jpeg',
      'u1'
    );

    expect(result).toMatchObject({
      success: false,
      category: 'image_too_large',
    });
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('refuses a small file that declares an enormous pixel size', async () => {
    const png = pngDeclaring(20_000, 20_000);
    expect(png.length).toBeLessThan(200);

    const result = await extractLabReport(png, 'image/png', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'image_too_large',
    });
    expect(dispatchAiRequest).not.toHaveBeenCalled();
  });

  it('lets a photo of ordinary size through to the AI step', async () => {
    const png = pngDeclaring(4000, 3000);

    const result = await extractLabReport(png, 'image/png', 'u1');

    expect(result).not.toMatchObject({ category: 'image_too_large' });
    expect(dispatchAiRequest).toHaveBeenCalled();
  });

  it('reports no AI configured', async () => {
    vi.mocked(chatRepository.getActiveVisionAiServiceSetting).mockResolvedValue(
      null as never
    );
    const result = await extractLabReport(
      pngDeclaring(100, 100),
      'image/png',
      'u1'
    );
    expect(result).toMatchObject({
      success: false,
      category: 'no_ai_configured',
    });
  });

  it("logs the category and provider of a failed call, never the provider's text", async () => {
    const detail =
      'AI service returned status 400: {"echo":"HbA1c 5.4 %"}\nforged log line';
    vi.mocked(dispatchAiRequest).mockResolvedValue({
      ok: false,
      category: 'upstream_error',
      detail,
    } as never);

    const result = await extractLabReport(
      pngDeclaring(100, 100),
      'image/jpeg',
      'u1'
    );

    // The person who sent the report still sees why it failed.
    expect(result).toMatchObject({
      success: false,
      category: 'upstream_error',
      error: detail,
    });
    const logged = vi.mocked(log).mock.calls.map((call) => String(call[1]));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('upstream_error');
    expect(logged[0]).not.toContain('HbA1c');
    expect(logged[0]).not.toContain('forged log line');
    expect(logged[0]).not.toContain('\n');
  });

  it('turns an unreadable answer into a parse error', async () => {
    vi.mocked(dispatchAiRequest).mockResolvedValue({
      ok: true,
      json: { results: [] },
    } as never);
    const result = await extractLabReport(
      pngDeclaring(100, 100),
      'image/jpeg',
      'u1'
    );
    expect(result).toMatchObject({ success: false, category: 'parse_error' });
  });
});
