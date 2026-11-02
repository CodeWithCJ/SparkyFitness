import { describe, expect, it, vi } from 'vitest';

// The real unpdf is used on purpose: the page limit has to hold against what
// the library actually reports, not against a mock of it.
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

import {
  MAX_PDF_PAGES,
  extractLabReport,
} from '../services/labReportScanService.js';

/** A minimal valid PDF with `pages` pages, all showing the same line of text. */
function buildPdf(pages: number, line: string, repeat = 1): string {
  const objects: string[] = [];
  const kids = Array.from({ length: pages }, (_, i) => `${5 + i} 0 R`).join(
    ' '
  );
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Count ${pages} /Kids [${kids}] >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  // Each run is placed on the page: text positioned off it is dropped.
  const shows = Array.from(
    { length: repeat },
    (_, i) => `1 0 0 1 72 ${100 + (i % 60) * 10} Tm (${line}) Tj`
  );
  const content = `BT /F1 12 Tf ${shows.join(' ')} ET`;
  objects.push(
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  );
  for (let i = 0; i < pages; i += 1) {
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 3 0 R >> >> >>'
    );
  }
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1').toString('base64');
}

describe('lab report PDF page limit (real unpdf)', () => {
  it('refuses a PDF with more pages than the limit, without reading it', async () => {
    const pdf = buildPdf(MAX_PDF_PAGES + 1, 'HbA1c 5.4 %');

    const result = await extractLabReport(pdf, 'application/pdf', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'document_too_large',
    });
  });

  it('still opens a PDF at the limit and reads its text layer', async () => {
    const pdf = buildPdf(MAX_PDF_PAGES, 'HbA1c 5.4 %');

    const result = await extractLabReport(pdf, 'application/pdf', 'u1');

    // Past the page check; short of the AI step only because no provider is set.
    expect(result).not.toMatchObject({ category: 'document_too_large' });
    expect(result).not.toMatchObject({ category: 'unreadable_pdf' });
  });

  it('stops reading a PDF whose text runs to hundreds of thousands of characters', async () => {
    // One page, 40,000 text runs: about 480,000 characters, far past the
    // read budget, in a file of about a megabyte.
    const pdf = buildPdf(1, 'HbA1c 5.4 %', 40_000);

    const result = await extractLabReport(pdf, 'application/pdf', 'u1');

    expect(result).toMatchObject({
      success: false,
      category: 'document_too_large',
    });
  });
});
